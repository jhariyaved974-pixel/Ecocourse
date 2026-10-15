'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Panel } from '@/components/admin/ui';
import { MarkdownField } from '@/components/admin/catalog/markdown-field';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { deleteFaq, reorderFaqs, saveFaq, setFaqVisibility } from '@/app/admin/(panel)/content/faqs/actions';
import { FAQ_LIMITS, previewTokens, unknownTokens, type TokenValues } from '@/lib/admin/content';
import { cn } from '@/lib/utils';
import { DragHandle, SortableList, orderBy, useLocalOrder } from './sortable';
import { TokenHelp } from './token-help';

export interface FaqRow {
  id: string;
  groupName: string;
  question: string;
  answer: string;
  isVisible: boolean;
  updatedAt: string;
}

interface Draft {
  id: string | null;
  groupName: string;
  question: string;
  answer: string;
  isVisible: boolean;
}

/** Groups in order of first appearance — the same order as the /faq page. */
function groupsOf(rows: FaqRow[]) {
  const map = new Map<string, FaqRow[]>();
  for (const r of rows) map.set(r.groupName, [...(map.get(r.groupName) ?? []), r]);
  return [...map.entries()].map(([name, items]) => ({ name, items }));
}

export function FaqManager({ faqs, tokens }: { faqs: FaqRow[]; tokens: TokenValues }) {
  const { run } = useActionRunner();
  const [ids, setIds, resetIds] = useLocalOrder(faqs.map((f) => f.id));
  const ordered = orderBy(faqs, ids);
  const groups = groupsOf(ordered);
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const [visibility, setVisibility] = React.useState<Record<string, { base: string; value: boolean }>>({});
  const visibleOf = (f: FaqRow) => (visibility[f.id]?.base === f.updatedAt ? visibility[f.id].value : f.isVisible);

  const saveOrder = async (next: string[]) => {
    setIds(next);
    const res = await run(() => reorderFaqs(next), { success: 'Order saved' });
    if (!res.ok) resetIds();
  };
  const moveGroup = (index: number, delta: number) => {
    const next = [...groups];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next.flatMap((g) => g.items.map((i) => i.id)));
  };
  const toggle = async (f: FaqRow, value: boolean) => {
    setVisibility((v) => ({ ...v, [f.id]: { base: f.updatedAt, value } }));
    const res = await run(() => setFaqVisibility({ id: f.id, visible: value }));
    if (!res.ok) setVisibility((v) => ({ ...v, [f.id]: { base: '', value } }));
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel
        title={`Questions (${faqs.length})`}
        description="Shown on /faq under their group headings. Drag questions within a group; use the arrows to order groups."
        actions={
          <Button size="sm" onClick={() => setEditing({ id: null, groupName: groups[0]?.name ?? 'General', question: '', answer: '', isVisible: true })}>
            <Plus /> New question
          </Button>
        }
      >
        {groups.length ? (
          <div className="space-y-4">
            {groups.map((g, gi) => (
              <section key={g.name} aria-label={`Group ${g.name}`} className="rounded-lg border border-line bg-surface-2/40 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {g.name} <span className="font-normal normal-case">· {g.items.length}</span>
                  </h3>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move group ${g.name} up`} disabled={gi === 0} onClick={() => moveGroup(gi, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move group ${g.name} down`} disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Add a question to ${g.name}`} onClick={() => setEditing({ id: null, groupName: g.name, question: '', answer: '', isVisible: true })}>
                      <Plus /> Question
                    </Button>
                  </div>
                </div>
                <SortableList
                  label={`Questions in ${g.name}`}
                  items={g.items}
                  itemLabel={(f) => f.question}
                  onReorder={(groupIds) => void saveOrder(groups.flatMap((x, i) => (i === gi ? groupIds : x.items.map((y) => y.id))))}
                  className="space-y-1.5"
                  renderItem={(f, handle) => {
                    const visible = visibleOf(f);
                    return (
                      <div className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-surface py-2 pr-1.5 pl-1 sm:flex-nowrap">
                        <DragHandle handle={handle} label={`Reorder “${f.question}”`} />
                        <div className={cn('min-w-0 flex-1 basis-[calc(100%-2.5rem)] pt-1 sm:basis-0', !visible && 'opacity-55')}>
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            {previewTokens(f.question, tokens)}
                            {!visible ? <Badge tone="neutral">Hidden</Badge> : null}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{previewTokens(f.answer, tokens)}</p>
                        </div>
                        <div className="ml-10 flex shrink-0 items-center gap-1 sm:mt-0.5 sm:ml-0">
                          <Switch checked={visible} onCheckedChange={(v) => toggle(f, v)} aria-label={`Show “${f.question}”`} />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit “${f.question}”`}
                            onClick={() => setEditing({ id: f.id, groupName: f.groupName, question: f.question, answer: f.answer, isVisible: f.isVisible })}
                          >
                            <Pencil />
                          </Button>
                          <ConfirmActionButton
                            title="Delete this question?"
                            description={`“${f.question}” is removed from the FAQ. Hide it instead to keep it for later.`}
                            confirmLabel="Delete"
                            danger
                            variant="ghost"
                            size="icon-sm"
                            action={() => deleteFaq(f.id)}
                          >
                            <Trash2 />
                            <span className="sr-only">Delete “{f.question}”</span>
                          </ConfirmActionButton>
                        </div>
                      </div>
                    );
                  }}
                />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={<CircleHelp className="size-5" />} title="No questions yet" description="Answer common questions about sizing, delivery, payments and returns." />
        )}
      </Panel>
      <TokenHelp values={tokens} />
      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent className="max-w-2xl">
          {editing ? <FaqForm key={editing.id ?? `new-${editing.groupName}`} initial={editing} groups={groups.map((g) => g.name)} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FaqForm({ initial, groups, onDone }: { initial: Draft; groups: string[]; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };
  const unknown = [...unknownTokens(form.question), ...unknownTokens(form.answer)];
  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(() => saveFaq(form), { onSuccess: onDone });
        setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial.id ? 'Edit question' : 'New question'}</DialogTitle>
        <DialogDescription>Questions are plain text; answers support Markdown (no HTML).</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
          <Field label="Group" htmlFor="faq-group" required error={errors.groupName} hint="Pick or type a new one">
            <Input id="faq-group" list="faq-group-options" value={form.groupName} maxLength={FAQ_LIMITS.group} onChange={(e) => set('groupName', e.target.value)} aria-invalid={errors.groupName ? true : undefined} />
            <datalist id="faq-group-options">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Question" htmlFor="faq-question" required error={errors.question} hint={`${form.question.length}/${FAQ_LIMITS.question}`}>
            <Input id="faq-question" value={form.question} maxLength={FAQ_LIMITS.question} placeholder="How long does delivery take?" onChange={(e) => set('question', e.target.value)} aria-invalid={errors.question ? true : undefined} />
          </Field>
        </div>
        <MarkdownField id="faq-answer" label="Answer" value={form.answer} onChange={(v) => set('answer', v)} maxLength={FAQ_LIMITS.answer} rows={7} error={errors.answer} />
        {unknown.length ? <p className="text-xs font-medium text-danger">Unknown placeholder {unknown.join(', ')}.</p> : null}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-2.5">
          <label htmlFor="faq-visible" className="text-sm">
            <span className="font-medium">Visible on /faq</span>
            <span className="block text-xs text-muted">Hidden questions stay here for later.</span>
          </label>
          <Switch id="faq-visible" checked={form.isVisible} onCheckedChange={(v) => set('isVisible', v)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {initial.id ? 'Save question' : 'Add question'}
        </Button>
      </DialogFooter>
    </form>
  );
}
