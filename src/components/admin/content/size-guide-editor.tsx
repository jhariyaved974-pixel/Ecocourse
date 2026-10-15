'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Badge, Notice } from '@/components/ui/misc';
import { PageHeader, Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { deleteSizeGuide, saveSizeGuide } from '@/app/admin/(panel)/content/size-guides/actions';
import { SIZE_GUIDE_LIMITS } from '@/lib/admin/content';
import { DragHandle, SortableList, orderBy, useUnsavedChangesWarning } from './sortable';

export interface SizeGuideValue {
  id: string | null;
  name: string;
  intro: string;
  notes: string;
  isDefault: boolean;
  rows: { uk: string; us: string; eu: string; footLengthCm: string }[];
}

interface RowState {
  id: string;
  uk: string;
  us: string;
  eu: string;
  footLengthCm: string;
}

let rowCounter = 0;
const newRowId = () => `row-${Date.now().toString(36)}-${++rowCounter}`;

/** Suggests the next row from the last one ("UK 7" → "UK 8", 25.4 cm → 26.2 cm). */
function nextRow(last: RowState | undefined): RowState {
  const blank = { id: newRowId(), uk: '', us: '', eu: '', footLengthCm: '' };
  if (!last) return blank;
  const step = (v: string, by: number) => {
    const m = /^([A-Za-z ]*?)(\d{1,2}(?:\.\d)?)$/.exec(v.trim());
    if (!m) return '';
    const n = Math.round((Number(m[2]) + by) * 10) / 10;
    return `${m[1]}${n}`;
  };
  return { ...blank, uk: step(last.uk, 1), us: step(last.us, 1), eu: step(last.eu, 1), footLengthCm: step(last.footLengthCm, 0.8) };
}

export function SizeGuideEditor({ guide, usage, currentDefault }: { guide: SizeGuideValue; usage: { products: number; categories: number }; currentDefault: string | null }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const initialRows = React.useMemo(() => guide.rows.map((r, i) => ({ id: `row-${i}`, ...r })), [guide.rows]);
  const [name, setName] = React.useState(guide.name);
  const [intro, setIntro] = React.useState(guide.intro);
  const [notes, setNotes] = React.useState(guide.notes);
  const [isDefault, setIsDefault] = React.useState(guide.isDefault);
  const [rows, setRows] = React.useState<RowState[]>(initialRows);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const isNew = guide.id === null;

  const current = { name, intro, notes, isDefault, rows: rows.map(({ uk, us, eu, footLengthCm }) => ({ uk, us, eu, footLengthCm })) };
  const dirty = JSON.stringify(current) !== JSON.stringify({ name: guide.name, intro: guide.intro, notes: guide.notes, isDefault: guide.isDefault, rows: guide.rows });
  useUnsavedChangesWarning(dirty);

  const updateRow = (id: string, patch: Partial<RowState>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rowError = (index: number) => errors[`rows.${index}.uk`] || errors[`rows.${index}.us`] || errors[`rows.${index}.eu`] || errors[`rows.${index}.footLengthCm`];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(() => saveSizeGuide({ id: guide.id, ...current }), {
      refresh: !isNew,
      onSuccess: (d) => {
        if (isNew) router.replace(`/admin/content/size-guides/${d.id}`);
      },
    });
    setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        back={{ href: '/admin/content/size-guides', label: 'Size guides' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {isNew ? 'New size guide' : guide.name}
            {guide.isDefault ? <Badge tone="success">Default</Badge> : null}
          </span>
        }
        description={isNew ? 'Size conversion table shown on product pages and /size-guide.' : `Used by ${usage.products} product${usage.products === 1 ? '' : 's'} and ${usage.categories} categor${usage.categories === 1 ? 'y' : 'ies'}${guide.isDefault ? ', and by every product without its own guide' : ''}.`}
        actions={
          <>
            {!isNew ? (
              <ConfirmActionButton
                title="Delete this size guide?"
                description={
                  <>
                    “{guide.name}” is removed.{' '}
                    {usage.products || usage.categories ? `${usage.products} product(s) and ${usage.categories} categor${usage.categories === 1 ? 'y' : 'ies'} fall back to the default guide. ` : ''}
                    {guide.isDefault ? 'It is the default guide, so /size-guide shows “coming soon” until you choose another default.' : ''}
                  </>
                }
                confirmLabel="Delete guide"
                danger
                variant="danger-outline"
                action={async () => {
                  const res = await deleteSizeGuide(guide.id!);
                  if (res.ok) router.push('/admin/content/size-guides');
                  return res;
                }}
              >
                <Trash2 /> Delete
              </ConfirmActionButton>
            ) : null}
            <Button type="submit" size="sm" loading={pending} disabled={!dirty && !isNew}>
              <Save /> {isNew ? 'Create guide' : 'Save guide'}
            </Button>
          </>
        }
      />
      {dirty && !isNew ? <Notice tone="warning" className="mb-6">You have unsaved changes.</Notice> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={`Sizes (${rows.length})`} description="One row per size, smallest first. Drag the grip to reorder. UK sizes are required; the others are optional.">
          <div className="space-y-2">
            <div className="hidden grid-cols-[32px_repeat(4,minmax(0,1fr))_32px] gap-2 px-1 text-xs font-medium text-muted sm:grid" aria-hidden>
              <span />
              <span>UK / India</span>
              <span>US</span>
              <span>EU</span>
              <span>Foot length (cm)</span>
              <span />
            </div>
            {rows.length ? (
              <SortableList
                label="Size rows"
                items={rows}
                itemLabel={(r) => (r.uk ? `UK ${r.uk}` : 'Empty row')}
                onReorder={(ids) => setRows((all) => orderBy(all, ids))}
                className="space-y-2"
                renderItem={(r, handle, index) => (
                  <div className="rounded-lg border border-line bg-surface p-1.5 sm:border-0 sm:bg-transparent sm:p-0">
                    <div className="grid grid-cols-[32px_repeat(2,minmax(0,1fr))_32px] items-center gap-2 sm:grid-cols-[32px_repeat(4,minmax(0,1fr))_32px]">
                      <DragHandle handle={handle} label={`Reorder row ${index + 1}`} className="row-span-2 sm:row-span-1" />
                      <SizeInput label={`UK size, row ${index + 1}`} short="UK" value={r.uk} onChange={(v) => updateRow(r.id, { uk: v })} invalid={Boolean(errors[`rows.${index}.uk`])} />
                      <SizeInput label={`US size, row ${index + 1}`} short="US" value={r.us} onChange={(v) => updateRow(r.id, { us: v })} invalid={Boolean(errors[`rows.${index}.us`])} />
                      <Button type="button" variant="ghost" size="icon-sm" className="row-span-2 sm:order-last sm:row-span-1" aria-label={`Remove row ${index + 1}`} onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}>
                        <Trash2 />
                      </Button>
                      <SizeInput label={`EU size, row ${index + 1}`} short="EU" value={r.eu} onChange={(v) => updateRow(r.id, { eu: v })} invalid={Boolean(errors[`rows.${index}.eu`])} />
                      <SizeInput
                        label={`Foot length in centimetres, row ${index + 1}`}
                        short="cm"
                        value={r.footLengthCm}
                        inputMode="decimal"
                        onChange={(v) => updateRow(r.id, { footLengthCm: v.replace(/[^\d.]/g, '') })}
                        invalid={Boolean(errors[`rows.${index}.footLengthCm`])}
                      />
                    </div>
                    {rowError(index) ? (
                      <p className="mt-1 pl-10 text-xs font-medium text-danger" role="alert">
                        Row {index + 1}: {rowError(index)}
                      </p>
                    ) : null}
                  </div>
                )}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No sizes yet. Add the first row.</p>
            )}
            {errors.rows ? (
              <p className="text-xs font-medium text-danger" role="alert">
                {errors.rows}
              </p>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={rows.length >= SIZE_GUIDE_LIMITS.rows} onClick={() => setRows((all) => [...all, nextRow(all[all.length - 1])])}>
              <Plus /> Add row
            </Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Details">
            <div className="space-y-4">
              <Field label="Name" htmlFor="sg-name" required error={errors.name} hint="Shown to staff when choosing a guide for a product or category.">
                <Input id="sg-name" value={name} maxLength={SIZE_GUIDE_LIMITS.name} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
              </Field>
              <Field label="Introduction" htmlFor="sg-intro" error={errors.intro} hint={`Plain text above the table · ${intro.length}/${SIZE_GUIDE_LIMITS.intro}`}>
                <Textarea id="sg-intro" rows={3} value={intro} maxLength={SIZE_GUIDE_LIMITS.intro} onChange={(e) => setIntro(e.target.value)} />
              </Field>
              <Field label="Notes" htmlFor="sg-notes" error={errors.notes} hint={`Small print below the table · ${notes.length}/${SIZE_GUIDE_LIMITS.notes}`}>
                <Textarea id="sg-notes" rows={3} value={notes} maxLength={SIZE_GUIDE_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-2.5">
                <label htmlFor="sg-default" className="text-sm">
                  <span className="font-medium">Default guide</span>
                  <span className="block text-xs text-muted">
                    Used on /size-guide and for products without their own guide.
                    {isDefault && currentDefault && currentDefault !== guide.name ? ` Replaces “${currentDefault}”.` : ''}
                  </span>
                </label>
                <Switch id="sg-default" checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
              {guide.isDefault && !isDefault ? <Notice tone="warning">Without a default guide, /size-guide shows “coming soon”.</Notice> : null}
            </div>
          </Panel>
        </div>
      </div>
    </form>
  );
}

function SizeInput({ label, short, value, onChange, invalid, inputMode }: { label: string; short: string; value: string; onChange: (v: string) => void; invalid?: boolean; inputMode?: 'decimal' }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-muted sm:hidden" aria-hidden>
        {short}
      </span>
      <Input value={value} maxLength={SIZE_GUIDE_LIMITS.size} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} aria-label={label} aria-invalid={invalid ? true : undefined} className="h-9 tabular-nums" />
    </label>
  );
}
