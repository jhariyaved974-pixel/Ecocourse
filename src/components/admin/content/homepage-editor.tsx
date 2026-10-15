'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  EyeOff,
  History,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Switch, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menus';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { PageHeader, Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import {
  addHomepageSection,
  deleteHomepageSection,
  discardHomepageDraft,
  duplicateHomepageSection,
  publishHomepage,
  reorderHomepageSections,
  restoreHomepageRevision,
  saveHomepageSection,
  setHomepageSectionVisibility,
} from '@/app/admin/(panel)/content/homepage/actions';
import {
  SECTION_LIMITS,
  SECTION_TYPES,
  SECTION_TYPE_ORDER,
  sectionProblems,
  sectionTitle,
  type CatalogOption,
  type EditorSection,
  type RevisionRow,
  type SectionType,
  type TokenValues,
} from '@/lib/admin/content';
import { cn, formatDateTime } from '@/lib/utils';
import { SectionForm, formToPayload, sectionToForm, type SectionFormValues } from './section-form';
import { DragHandle, SortableList, moveBy, orderBy, useLocalOrder, useUnsavedChangesWarning } from './sortable';
import { TokenHelp } from './token-help';

interface Edit {
  /** updated_at of the section when editing started. */
  base: string;
  values: SectionFormValues;
  /** Saved successfully; ignored once the refreshed section arrives. */
  saved?: boolean;
}

export function HomepageEditor({
  sections,
  hasChanges,
  revisions,
  categories,
  collections,
  tokens,
  loadError,
}: {
  sections: EditorSection[];
  hasChanges: boolean;
  revisions: RevisionRow[];
  categories: CatalogOption[];
  collections: CatalogOption[];
  tokens: TokenValues;
  loadError: string | null;
}) {
  const { run, pending } = useActionRunner();
  const [orderIds, setOrderIds, resetOrder] = useLocalOrder(sections.map((s) => s.id));
  const ordered = orderBy(sections, orderIds);
  const [selectedId, setSelectedId] = React.useState<string | null>(sections[0]?.id ?? null);
  const selected = ordered.find((s) => s.id === selectedId) ?? ordered[0] ?? null;
  const [edits, setEdits] = React.useState<Record<string, Edit>>({});
  const [errors, setErrors] = React.useState<Record<string, Record<string, string>>>({});
  const [visibility, setVisibility] = React.useState<Record<string, { base: string; value: boolean }>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<EditorSection | null>(null);
  const formRef = React.useRef<HTMLDivElement>(null);

  const activeEdit = (s: EditorSection): Edit | null => {
    const e = edits[s.id];
    if (!e) return null;
    if (e.saved && e.base !== s.updated_at) return null;
    return e;
  };
  const isDirty = (s: EditorSection) => {
    const e = activeEdit(s);
    return Boolean(e && !e.saved && JSON.stringify(e.values) !== JSON.stringify(sectionToForm(s)));
  };
  const isVisible = (s: EditorSection) => {
    const v = visibility[s.id];
    return v && v.base === s.updated_at ? v.value : s.is_visible;
  };
  const dirtySections = ordered.filter(isDirty);
  useUnsavedChangesWarning(dirtySections.length > 0);

  const select = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const reorder = async (ids: string[]) => {
    setOrderIds(ids);
    const res = await run(() => reorderHomepageSections(ids), { success: 'Order saved to the draft' });
    if (!res.ok) resetOrder();
  };

  const toggleVisibility = async (s: EditorSection, value: boolean) => {
    setVisibility((v) => ({ ...v, [s.id]: { base: s.updated_at, value } }));
    const res = await run(() => setHomepageSectionVisibility({ id: s.id, visible: value }));
    if (!res.ok) {
      setVisibility((v) => {
        const next = { ...v };
        delete next[s.id];
        return next;
      });
    }
  };

  const save = async (s: EditorSection) => {
    const e = activeEdit(s);
    const values = e?.values ?? sectionToForm(s);
    setBusy(`save:${s.id}`);
    const res = await run(() => saveHomepageSection({ id: s.id, values: formToPayload(s.type, values) }));
    setBusy(null);
    if (res.ok) {
      setEdits((all) => ({ ...all, [s.id]: { base: s.updated_at, values, saved: true } }));
      setErrors((all) => ({ ...all, [s.id]: {} }));
    } else {
      setErrors((all) => ({ ...all, [s.id]: res.fieldErrors ?? {} }));
    }
  };

  const discardEdit = (id: string) => {
    setEdits((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    setErrors((all) => ({ ...all, [id]: {} }));
  };

  const add = async (type: SectionType) => {
    setBusy(`add:${type}`);
    const res = await run(() => addHomepageSection({ type, afterId: selected?.id ?? null }), {
      onSuccess: (d) => setSelectedId(d.id),
    });
    setBusy(null);
    if (res.ok) setAddOpen(false);
  };

  const duplicate = (s: EditorSection) => run(() => duplicateHomepageSection(s.id), { onSuccess: (d) => setSelectedId(d.id) });

  const problemsFor = (s: EditorSection) => sectionProblems(s);
  const visibleProblems = ordered.filter((s) => isVisible(s) && problemsFor(s).length > 0);
  const liveRevision = revisions[0] ?? null;
  const selectedValues = selected ? (activeEdit(selected)?.values ?? sectionToForm(selected)) : null;
  const selectedDirty = selected ? isDirty(selected) : false;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Homepage
            {hasChanges ? <Badge tone="warning">Unpublished changes</Badge> : <Badge tone="success">Draft matches live</Badge>}
          </span>
        }
        description={
          liveRevision
            ? `You are editing the draft. Live version published ${formatDateTime(liveRevision.publishedAt)}${liveRevision.author ? ` by ${liveRevision.author}` : ''}.`
            : 'You are editing the draft. Customers see the homepage only after you publish it.'
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href="/admin/content/homepage/preview" target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Preview draft
              </a>
            </Button>
            <ConfirmActionButton
              title="Discard the draft?"
              description="All saved draft changes are replaced with the live homepage. This cannot be undone (published versions stay in the history)."
              confirmLabel="Discard draft"
              danger
              disabled={!hasChanges}
              success="Draft reset to the live homepage"
              action={async () => {
                const res = await discardHomepageDraft();
                if (res.ok) setEdits({});
                return res;
              }}
            >
              <Undo2 /> Discard draft
            </ConfirmActionButton>
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <Send /> Publish
            </Button>
          </>
        }
      />

      {loadError ? (
        <Notice tone="danger" className="mb-6">
          {loadError}
        </Notice>
      ) : null}
      {dirtySections.length ? (
        <Notice tone="warning" className="mb-6" title={`Unsaved changes in ${dirtySections.length === 1 ? '1 section' : `${dirtySections.length} sections`}`}>
          Save them to include them in the preview and the next publish: {dirtySections.map((s) => `“${sectionTitle(s)}”`).join(', ')}.
        </Notice>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,370px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel
            title={`Sections (${ordered.length})`}
            description="Drag the grip to reorder. Order and visibility save to the draft right away."
            actions={
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus /> Add
              </Button>
            }
            className="[&>div:last-child]:p-3"
          >
            {ordered.length ? (
              <SortableList
                label="Homepage sections"
                items={ordered}
                itemLabel={(s) => sectionTitle(s)}
                onReorder={reorder}
                className="space-y-1.5"
                renderItem={(s, handle, index) => {
                  const active = selected?.id === s.id;
                  const visible = isVisible(s);
                  const problems = problemsFor(s);
                  const title = sectionTitle(s);
                  return (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border bg-surface py-1.5 pr-1.5 pl-1 transition-colors',
                        active ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <DragHandle handle={handle} label={`Reorder section ${index + 1}: ${title}`} />
                      <button
                        type="button"
                        onClick={() => select(s.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn('min-w-0 flex-1 rounded-md px-1 py-0.5 text-left focus-visible:outline-2 focus-visible:outline-ink', !visible && 'opacity-55')}
                      >
                        <span className="block text-[11px] font-medium tracking-wide text-muted uppercase">
                          {index + 1}. {SECTION_TYPES[s.type].label}
                        </span>
                        <span className="block truncate text-sm font-medium">{title}</span>
                        {!visible || isDirty(s) || problems.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {!visible ? (
                              <Badge tone="neutral">
                                <EyeOff className="size-3" aria-hidden /> Hidden
                              </Badge>
                            ) : null}
                            {isDirty(s) ? <Badge tone="warning">Unsaved</Badge> : null}
                            {problems.length ? (
                              <Badge tone="danger" title={problems.map((p) => p.message).join(' ')}>
                                <AlertTriangle className="size-3" aria-hidden /> Needs attention
                              </Badge>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                      <Switch checked={visible} onCheckedChange={(v) => toggleVisibility(s, v)} aria-label={`Show “${title}” on the homepage`} disabled={pending} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`More actions for “${title}”`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem disabled={index === 0} onSelect={() => reorder(moveBy(orderIds, index, -1))}>
                            <ArrowUp /> Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={index === ordered.length - 1} onSelect={() => reorder(moveBy(orderIds, index, 1))}>
                            <ArrowDown /> Move down
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => duplicate(s)}>
                            <Copy /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDeleteTarget(s)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                }}
              />
            ) : (
              <EmptyState
                icon={<LayoutTemplate className="size-5" />}
                title="The draft is empty"
                description="Add a section to start building the homepage."
                action={
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus /> Add section
                  </Button>
                }
              />
            )}
          </Panel>

          <Panel title="Publish history" description="Every publish is kept. Restoring copies a version into the draft; publish it to make it live.">
            {revisions.length ? (
              <ol className="-my-2 divide-y divide-line">
                {revisions.map((r, i) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {formatDateTime(r.publishedAt)}
                        {i === 0 ? <Badge tone="success">Live</Badge> : null}
                      </p>
                      <p className="text-xs text-muted">
                        {r.author ?? 'System'}
                        {r.sectionCount !== null ? ` · ${r.sectionCount} section${r.sectionCount === 1 ? '' : 's'}` : ''}
                      </p>
                      {r.note ? <p className="mt-1 text-xs break-words text-ink-2">“{r.note}”</p> : null}
                    </div>
                    <ConfirmActionButton
                      title="Restore this version into the draft?"
                      description={`The current draft is replaced with the homepage published ${formatDateTime(r.publishedAt)}. The live homepage does not change until you publish.`}
                      confirmLabel="Restore to draft"
                      success="Revision restored into the draft — review it, then publish"
                      action={async () => {
                        const res = await restoreHomepageRevision(r.id);
                        if (res.ok) setEdits({});
                        return res;
                      }}
                    >
                      <RotateCcw /> Restore
                    </ConfirmActionButton>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <History className="size-4" aria-hidden /> Nothing published yet.
              </p>
            )}
          </Panel>
        </div>

        <div ref={formRef} className="scroll-mt-4">
          {selected && selectedValues ? (
            <form
              key={selected.id}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save(selected);
              }}
            >
              <Panel
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {SECTION_TYPES[selected.type].label}
                    {!isVisible(selected) ? <Badge tone="neutral">Hidden</Badge> : null}
                    {selectedDirty ? <Badge tone="warning">Unsaved</Badge> : null}
                  </span>
                }
                description={SECTION_TYPES[selected.type].description}
              >
                <div className="space-y-6">
                  {SECTION_TYPES[selected.type].note ? <Notice tone="info">{SECTION_TYPES[selected.type].note}</Notice> : null}
                  <SectionForm
                    section={selected}
                    values={selectedValues}
                    errors={errors[selected.id] ?? {}}
                    categories={categories}
                    collections={collections}
                    onChange={(values) => setEdits((all) => ({ ...all, [selected.id]: { base: selected.updated_at, values } }))}
                  />
                  {SECTION_TYPES[selected.type].fields.some((f) => ['eyebrow', 'heading', 'subheading', 'body', 'uspItems'].includes(f)) ? (
                    <TokenHelp values={tokens} compact />
                  ) : null}
                </div>
                <div className="sticky bottom-0 -mx-5 mt-6 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
                  {selectedDirty ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => discardEdit(selected.id)}>
                      Undo changes
                    </Button>
                  ) : null}
                  <Button type="submit" size="sm" loading={busy === `save:${selected.id}`} disabled={!selectedDirty && !Object.keys(errors[selected.id] ?? {}).length}>
                    <Save /> Save section
                  </Button>
                </div>
              </Panel>
            </form>
          ) : (
            <Panel>
              <p className="text-sm text-muted">Select or add a section to edit it.</p>
            </Panel>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
              {selected ? `It is added after “${sectionTitle(selected)}” with starter content you can edit.` : 'It is added with starter content you can edit.'}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SECTION_TYPE_ORDER.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => add(type)}
                  className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line p-3.5 text-left transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-60"
                >
                  <span className="text-sm font-semibold">
                    {SECTION_TYPES[type].label}
                    {busy === `add:${type}` ? '…' : ''}
                  </span>
                  <span className="text-xs text-muted">{SECTION_TYPES[type].description}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => (open ? null : setDeleteTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this section?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `“${sectionTitle(deleteTarget)}” is removed from the draft. The live homepage keeps it until you publish; you can also hide a section instead.` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={async () => {
                if (!deleteTarget) return;
                const res = await run(() => deleteHomepageSection(deleteTarget.id));
                if (res.ok) {
                  discardEdit(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        hasChanges={hasChanges}
        unsaved={dirtySections.map((s) => sectionTitle(s))}
        problems={visibleProblems.map((s) => `${sectionTitle(s)}: ${problemsFor(s)[0]?.message}`)}
      />
    </>
  );
}

function PublishDialog({
  open,
  onOpenChange,
  hasChanges,
  unsaved,
  problems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasChanges: boolean;
  unsaved: string[];
  problems: string[];
}) {
  const [note, setNote] = React.useState('');
  const { run, pending } = useActionRunner();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish the homepage?</DialogTitle>
          <DialogDescription>The saved draft replaces the live homepage for every visitor. The current live version stays in the publish history.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!hasChanges ? <Notice tone="neutral">The draft is the same as the live homepage. Publishing again only adds a history entry.</Notice> : null}
          {unsaved.length ? (
            <Notice tone="warning" title="Unsaved changes are not included">
              {unsaved.map((t) => `“${t}”`).join(', ')}
            </Notice>
          ) : null}
          {problems.length ? (
            <Notice tone="danger" title="Fix these sections first">
              <ul className="list-disc pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          <Field label="Note (optional)" htmlFor="publish-note" hint={`What changed, for the history. ${note.length}/${SECTION_LIMITS.publishNote}`}>
            <Textarea id="publish-note" rows={2} maxLength={SECTION_LIMITS.publishNote} value={note} placeholder="e.g. Diwali campaign banner" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={problems.length > 0}
            onClick={async () => {
              const res = await run(() => publishHomepage({ note }), { success: 'Homepage published' });
              if (res.ok) {
                setNote('');
                onOpenChange(false);
              }
            }}
          >
            <Send /> Publish now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
