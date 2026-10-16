'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Columns3, Rows3, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { PageHeader, Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { deleteSizeGuide, saveSizeGuide } from '@/app/admin/(panel)/content/size-guides/actions';
import { SIZE_GUIDE_LIMITS, SIZE_GUIDE_TEMPLATES } from '@/lib/admin/content';
import { cn } from '@/lib/utils';
import { DragHandle, SortableList, orderBy, useUnsavedChangesWarning } from './sortable';

export interface SizeGuideValue {
  id: string | null;
  name: string;
  intro: string;
  notes: string;
  /** Header labels (1–8); the first column labels each row. */
  columns: string[];
  /** One array of cells per row, each with exactly one cell per column. */
  rows: string[][];
}

interface ColumnState {
  id: string;
  label: string;
}

interface RowState {
  id: string;
  cells: string[];
}

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

const CLOTHING_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
const NUMBER_RE = /^(.*?)(\d+(?:\.\d+)?)$/;
const RANGE_RE = /^(\d+(?:\.\d+)?)\s*([–-])\s*(\d+(?:\.\d+)?)$/;

const decimals = (...values: number[]) => Math.min(2, Math.max(0, ...values.map((v) => (String(v).split('.')[1] ?? '').length)));
const fmt = (n: number, d: number) => n.toFixed(d);

/**
 * Suggests the next value of a column from the last two rows: the next
 * clothing size (M → L), the next number with the same step (UK 7 → UK 8,
 * 25.4 → 26.2) or the next range (38–40 → 40–42). Empty when unsure.
 */
function stepCell(prev: string | undefined, last: string | undefined): string {
  const value = (last ?? '').trim();
  if (!value) return '';
  const size = CLOTHING_SIZES.indexOf(value.toUpperCase());
  if (size >= 0) return CLOTHING_SIZES[size + 1] ?? '';
  const range = RANGE_RE.exec(value);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[3])];
    const p = prev ? RANGE_RE.exec(prev.trim()) : null;
    const step = p ? a - Number(p[1]) : b - a;
    if (!step) return '';
    const d = decimals(a, b, step);
    return `${fmt(a + step, d)}${range[2]}${fmt(b + step, d)}`;
  }
  const m = NUMBER_RE.exec(value);
  if (!m) return '';
  const p = prev ? NUMBER_RE.exec(prev.trim()) : null;
  const step = p && p[1] === m[1] ? Number(m[2]) - Number(p[2]) : 1;
  if (!step || !Number.isFinite(step)) return '';
  return `${m[1]}${fmt(Number(m[2]) + step, decimals(Number(m[2]), step))}`;
}

export function SizeGuideEditor({ guide, usage }: { guide: SizeGuideValue; usage: { products: number; categories: string[] } }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const isNew = guide.id === null;
  const initialColumns = React.useMemo<ColumnState[]>(
    () => (guide.columns.length ? guide.columns : [...SIZE_GUIDE_TEMPLATES[SIZE_GUIDE_TEMPLATES.length - 1].columns]).map((label, i) => ({ id: `col-${i}`, label })),
    [guide.columns],
  );
  const initialRows = React.useMemo<RowState[]>(() => guide.rows.map((cells, i) => ({ id: `row-${i}`, cells: [...cells] })), [guide.rows]);
  const [name, setName] = React.useState(guide.name);
  const [intro, setIntro] = React.useState(guide.intro);
  const [notes, setNotes] = React.useState(guide.notes);
  const [columns, setColumns] = React.useState<ColumnState[]>(initialColumns);
  const [rows, setRows] = React.useState<RowState[]>(initialRows);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const current = { name, intro, notes, columns: columns.map((c) => c.label), rows: rows.map((r) => r.cells) };
  const saved = { name: guide.name, intro: guide.intro, notes: guide.notes, columns: initialColumns.map((c) => c.label), rows: guide.rows };
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  useUnsavedChangesWarning(dirty);
  const hasContent = rows.some((r) => r.cells.some((c) => c.trim()));

  const clearError = (...keys: string[]) =>
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });

  // Column operations keep every row's cells aligned with the headers.
  const addColumn = () => {
    setColumns((all) => [...all, { id: newId('col'), label: '' }]);
    setRows((all) => all.map((r) => ({ ...r, cells: [...r.cells, ''] })));
    window.setTimeout(() => document.getElementById(`sg-col-${columns.length}`)?.focus(), 0);
  };
  const removeColumn = (index: number) => {
    const label = columns[index]?.label || `column ${index + 1}`;
    if (rows.some((r) => r.cells[index]?.trim()) && !window.confirm(`Remove “${label}” and its values from every row?`)) return;
    setColumns((all) => all.filter((_, i) => i !== index));
    setRows((all) => all.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== index) })));
    setErrors({});
  };
  const moveColumn = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= columns.length) return;
    const swap = <T,>(list: T[]) => {
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    };
    setColumns(swap);
    setRows((all) => all.map((r) => ({ ...r, cells: swap(r.cells) })));
    setErrors({});
  };
  const applyTemplate = (labels: readonly string[]) => {
    setColumns(labels.map((label) => ({ id: newId('col'), label })));
    setRows((all) => all.map((r) => ({ ...r, cells: labels.map((_, i) => r.cells[i] ?? '') })));
    setErrors({});
  };

  const addRow = () =>
    setRows((all) => {
      const last = all[all.length - 1];
      const prev = all[all.length - 2];
      return [...all, { id: newId('row'), cells: columns.map((_, i) => stepCell(prev?.cells[i], last?.cells[i])) }];
    });
  const updateCell = (rowId: string, index: number, value: string) => {
    setRows((all) => all.map((r) => (r.id === rowId ? { ...r, cells: r.cells.map((c, i) => (i === index ? value : c)) } : r)));
  };

  const rowError = (index: number) => {
    const prefix = `rows.${index}.cells`;
    return errors[`${prefix}.0`] ?? errors[prefix] ?? Object.entries(errors).find(([k]) => k.startsWith(`${prefix}.`))?.[1];
  };
  const columnError = errors.columns ?? Object.entries(errors).find(([k]) => k.startsWith('columns.'))?.[1];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await run(() => saveSizeGuide({ id: guide.id, name, intro, notes, columns: current.columns, rows: current.rows.map((cells) => ({ cells })) }), {
      refresh: !isNew,
      onSuccess: (d) => {
        if (isNew) router.replace(`/admin/content/size-guides/${d.id}`);
      },
    });
    setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
  };

  // Drag handle, one track per column (at least 7rem so cells stay usable), remove button.
  const template = `32px repeat(${columns.length}, minmax(7rem, 1fr)) 32px`;
  const minWidth = `${columns.length * 7.5 + 5}rem`;
  const usedBy = [
    usage.categories.length ? `${usage.categories.length} categor${usage.categories.length === 1 ? 'y' : 'ies'} (${usage.categories.slice(0, 4).join(', ')}${usage.categories.length > 4 ? '…' : ''})` : '',
    usage.products ? `${usage.products} product${usage.products === 1 ? '' : 's'} with their own choice` : '',
  ].filter(Boolean);

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        back={{ href: '/admin/content/size-guides', label: 'Size guides' }}
        title={isNew ? 'New size guide' : guide.name}
        description={
          isNew
            ? 'A measurement table shown on product pages and at /size-guide. Link it to a category once it is saved.'
            : usedBy.length
              ? `Used by ${usedBy.join(' and ')}.`
              : 'Not linked yet. Link it to a category under Categories & brands, or choose it in a product.'
        }
        actions={
          <>
            {!isNew ? (
              <ConfirmActionButton
                title="Delete this size guide?"
                description={
                  <>
                    “{guide.name}” is removed.{' '}
                    {usedBy.length ? `${usedBy.join(' and ')} will show no size guide until you link another one.` : ''}
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
        <div className="min-w-0 space-y-6">
          <Panel
            title={`Table (${columns.length} column${columns.length === 1 ? '' : 's'}, ${rows.length} row${rows.length === 1 ? '' : 's'})`}
            description="Headings across the top, one row per size. The first column labels each row and is required; other cells may be left empty. Drag the grip to reorder rows."
          >
            <div className="space-y-3">
              {!hasContent ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Start from:</span>
                  {SIZE_GUIDE_TEMPLATES.map((t) => (
                    <Button key={t.label} type="button" size="sm" variant="outline" onClick={() => applyTemplate(t.columns)}>
                      {t.label}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className="relative overflow-x-auto pb-1">
                <div className="space-y-2" style={{ minWidth }}>
                  <div className="grid items-start gap-2" style={{ gridTemplateColumns: template }}>
                    <span />
                    {columns.map((c, ci) => (
                      <div key={c.id} className="min-w-0">
                        <label htmlFor={`sg-col-${ci}`} className="sr-only">
                          Heading of column {ci + 1}
                        </label>
                        <Input
                          id={`sg-col-${ci}`}
                          value={c.label}
                          maxLength={SIZE_GUIDE_LIMITS.cell}
                          placeholder={ci === 0 ? 'e.g. Size' : 'Heading'}
                          aria-invalid={errors[`columns.${ci}`] ? true : undefined}
                          className="h-9 font-medium"
                          onChange={(e) => {
                            const value = e.target.value;
                            setColumns((all) => all.map((x) => (x.id === c.id ? { ...x, label: value } : x)));
                            clearError(`columns.${ci}`, 'columns');
                          }}
                        />
                        <div className="mt-0.5 flex items-center justify-end sm:justify-between">
                          <span className="hidden truncate pl-1 text-[11px] text-muted sm:inline">{ci === 0 ? 'Row label' : `Column ${ci + 1}`}</span>
                          <span className="flex">
                            <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move column ${c.label || ci + 1} left`} disabled={ci === 0} onClick={() => moveColumn(ci, -1)}>
                              <ArrowLeft />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Move column ${c.label || ci + 1} right`}
                              disabled={ci === columns.length - 1}
                              onClick={() => moveColumn(ci, 1)}
                            >
                              <ArrowRight />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Remove column ${c.label || ci + 1}`}
                              disabled={columns.length === 1}
                              onClick={() => removeColumn(ci)}
                            >
                              <X />
                            </Button>
                          </span>
                        </div>
                      </div>
                    ))}
                    <span />
                  </div>

                  {rows.length ? (
                    <SortableList
                      label="Size guide rows"
                      items={rows}
                      itemLabel={(r) => r.cells[0] || 'Empty row'}
                      onReorder={(ids) => setRows((all) => orderBy(all, ids))}
                      className="space-y-2"
                      renderItem={(r, handle, index) => {
                        const message = rowError(index);
                        return (
                          <div>
                            <div className="grid items-center gap-2" style={{ gridTemplateColumns: template }}>
                              <DragHandle handle={handle} label={`Reorder row ${r.cells[0] || index + 1}`} />
                              {columns.map((c, ci) => (
                                <Input
                                  key={c.id}
                                  value={r.cells[ci] ?? ''}
                                  maxLength={SIZE_GUIDE_LIMITS.cell}
                                  aria-label={`${c.label || `Column ${ci + 1}`}, row ${index + 1}`}
                                  aria-invalid={errors[`rows.${index}.cells.${ci}`] || (ci === 0 && errors[`rows.${index}.cells`]) ? true : undefined}
                                  className={cn('h-9 tabular-nums', ci === 0 && 'font-medium')}
                                  onChange={(e) => {
                                    updateCell(r.id, ci, e.target.value);
                                    clearError(`rows.${index}.cells.${ci}`, `rows.${index}.cells`);
                                  }}
                                />
                              ))}
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${r.cells[0] || index + 1}`} onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}>
                                <Trash2 />
                              </Button>
                            </div>
                            {message ? (
                              <p className="mt-1 pl-10 text-xs font-medium text-danger" role="alert">
                                Row {index + 1}: {message}
                              </p>
                            ) : null}
                          </div>
                        );
                      }}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No rows yet. Add the first row.</p>
                  )}
                </div>
              </div>

              {columnError ? (
                <p className="text-xs font-medium text-danger" role="alert">
                  {columnError}
                </p>
              ) : null}
              {errors.rows ? (
                <p className="text-xs font-medium text-danger" role="alert">
                  {errors.rows}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={rows.length >= SIZE_GUIDE_LIMITS.rows} onClick={addRow}>
                  <Rows3 /> Add row
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={columns.length >= SIZE_GUIDE_LIMITS.columns} onClick={addColumn}>
                  <Columns3 /> Add column
                </Button>
                <span className="self-center text-xs text-muted">
                  Up to {SIZE_GUIDE_LIMITS.columns} columns and {SIZE_GUIDE_LIMITS.rows} rows; {SIZE_GUIDE_LIMITS.cell} characters per cell.
                </span>
              </div>
            </div>
          </Panel>

          <Panel title="Preview" description="How shoppers see the table (unsaved changes included).">
            <GuidePreview columns={current.columns} rows={current.rows} intro={intro} notes={notes} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Details">
            <div className="space-y-4">
              <Field label="Name" htmlFor="sg-name" required error={errors.name} hint="Shown to staff when linking a guide to a category or product, and as the heading on /size-guide.">
                <Input id="sg-name" value={name} maxLength={SIZE_GUIDE_LIMITS.name} placeholder="e.g. Clothing (unisex)" onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />
              </Field>
              <Field label="Introduction" htmlFor="sg-intro" error={errors.intro} hint={`Plain text above the table · ${intro.length}/${SIZE_GUIDE_LIMITS.intro}`}>
                <Textarea id="sg-intro" rows={3} value={intro} maxLength={SIZE_GUIDE_LIMITS.intro} placeholder="How to measure, and which size to pick between two." onChange={(e) => setIntro(e.target.value)} />
              </Field>
              <Field label="Notes" htmlFor="sg-notes" error={errors.notes} hint={`Small print below the table · ${notes.length}/${SIZE_GUIDE_LIMITS.notes}`}>
                <Textarea id="sg-notes" rows={3} value={notes} maxLength={SIZE_GUIDE_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </Panel>
          <Notice tone="neutral" title="Where it appears">
            Products show the guide chosen in the product editor, otherwise their category&apos;s guide, otherwise their department&apos;s. Products in
            categories without a guide (most electronics, home and beauty items) show none.
          </Notice>
        </div>
      </div>
    </form>
  );
}

function GuidePreview({ columns, rows, intro, notes }: { columns: string[]; rows: string[][]; intro: string; notes: string }) {
  const filled = rows.filter((r) => r.some((c) => c.trim()));
  return (
    <div className="space-y-3 text-sm">
      {intro.trim() ? <p className="text-ink-2">{intro}</p> : null}
      {filled.length ? (
        <div className="relative overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                    {c || `Column ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filled.map((r, ri) => (
                <tr key={ri} className="border-t border-line">
                  {columns.map((_, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row" className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                        {r[0] || '—'}
                      </th>
                    ) : (
                      <td key={ci} className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {r[ci] || '—'}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted">Add rows to see the table.</p>
      )}
      {notes.trim() ? <p className="text-xs text-muted">{notes}</p> : null}
    </div>
  );
}

