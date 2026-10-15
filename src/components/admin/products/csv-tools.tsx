'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Notice } from '@/components/ui/misc';
import { Field, Input } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyProductImport, exportProductsCsv, previewProductImport } from '@/app/admin/(panel)/products/actions';
import {
  PRODUCT_CSV_COLUMNS,
  PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_OPTIONAL_COLUMNS,
  toCsv,
  type ImportApplyResult,
  type ImportPreview,
  type ProductListFilters,
} from '@/lib/admin/products';

function downloadText(filename: string, text: string) {
  // BOM so spreadsheet apps detect UTF-8 (₹, accented names).
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProductCsvTools({ filters }: { filters: ProductListFilters }) {
  const [exporting, startExport] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        loading={exporting}
        onClick={() =>
          startExport(async () => {
            const res = await exportProductsCsv(filters);
            if (!res.ok) return void toast.error(res.error);
            downloadText(res.data.filename, res.data.csv);
            toast.success(res.message ?? 'Exported');
          })
        }
      >
        {exporting ? null : <Download />} Export CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload /> Import CSV
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

interface ParsedFile {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

const ACTION_TONE = { create: 'info', update: 'success', unchanged: 'neutral', error: 'danger' } as const;
const ACTION_TEXT = { create: 'Create', update: 'Update', unchanged: 'No change', error: 'Error' } as const;

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [file, setFile] = React.useState<ParsedFile | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportApplyResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setFileError(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const runPreview = (parsed: ParsedFile) =>
    startTransition(async () => {
      const res = await previewProductImport({ columns: parsed.columns, rows: parsed.rows });
      if (!res.ok) {
        setFileError(res.error);
        return;
      }
      setPreview(res.data);
    });

  const onFile = (f: File | undefined) => {
    setPreview(null);
    setResult(null);
    setFileError(null);
    setFile(null);
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return setFileError('The file is larger than 2 MB. Split it into smaller files.');
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^﻿/, '').trim().toLowerCase(),
      complete: (out) => {
        const columns = (out.meta.fields ?? []).filter(Boolean);
        if (out.errors.length && !out.data.length) return setFileError(`The file could not be read: ${out.errors[0]?.message}`);
        if (!out.data.length) return setFileError('The file has no data rows.');
        if (out.data.length > PRODUCT_IMPORT_MAX_ROWS) {
          return setFileError(`The file has ${out.data.length} rows; import at most ${PRODUCT_IMPORT_MAX_ROWS} at a time.`);
        }
        const parsed = { name: f.name, columns, rows: out.data };
        setFile(parsed);
        runPreview(parsed);
      },
      error: (err) => setFileError(`The file could not be read: ${err.message}`),
    });
  };

  const apply = () =>
    startTransition(async () => {
      if (!file) return;
      const res = await applyProductImport({ columns: file.columns, rows: file.rows });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      setPreview(null);
      toast.success(res.message ?? 'Import finished');
      router.refresh();
    });

  const template = () =>
    downloadText(
      'products-import-template.csv',
      toCsv(
        [...PRODUCT_CSV_COLUMNS, ...PRODUCT_IMPORT_OPTIONAL_COLUMNS],
        [['', 'Example Runner', 'example-runner', 'AU-EXR', 'draft', 'running', '4999', '', '', 'running, mesh', 'Lightweight daily trainer.', 'unisex']],
      ),
    );

  const applicable = preview ? preview.counts.create + preview.counts.update : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Creates new draft products or updates basic fields of existing ones (matched by <code>id</code>, then <code>sku</code>). Colours, sizes,
            media and stock are never changed here — use the editor and Inventory for those.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-xs leading-relaxed text-ink-2">
            <p>
              <strong>Required columns:</strong> name, sku, price_rupees. <strong>Optional:</strong> id, slug, status, category (slug or name),
              sale_price_rupees, tags (comma separated), short_description, gender. The <code>stock</code> column of an export is ignored.
            </p>
            <p className="mt-1">
              Optional columns that are present but empty clear the value (category, sale price, tags). Up to {PRODUCT_IMPORT_MAX_ROWS} rows per file.{' '}
              <button type="button" onClick={template} className="font-medium underline underline-offset-2 hover:text-ink">
                Download a template
              </button>
              .
            </p>
          </div>

          <Field label="CSV file" htmlFor="product-import-file" hint={file ? `${file.name} · ${file.rows.length} row(s)` : 'UTF-8 CSV with a header row.'}>
            <Input
              ref={inputRef}
              id="product-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              disabled={pending}
            />
          </Field>

          {fileError ? <Notice tone="danger">{fileError}</Notice> : null}
          {pending && !preview && !result ? <p className="text-sm text-muted">Checking the file…</p> : null}

          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="info">{preview.counts.create} to create</Badge>
                <Badge tone="success">{preview.counts.update} to update</Badge>
                <Badge tone="neutral">{preview.counts.unchanged} unchanged</Badge>
                <Badge tone={preview.counts.error ? 'danger' : 'neutral'}>{preview.counts.error} with errors</Badge>
              </div>
              {preview.counts.error ? (
                <Notice tone="warning">Fix the rows with errors in your file and choose it again. Nothing is imported until every row is valid.</Notice>
              ) : null}
              <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">Row</th>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">SKU</th>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">Name</th>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">Result</th>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-line align-top">
                        <td className="px-3 py-2 tabular-nums text-muted">{r.row}</td>
                        <td className="px-3 py-2 font-mono">{r.sku || '—'}</td>
                        <td className="max-w-48 truncate px-3 py-2">{r.name || '—'}</td>
                        <td className="px-3 py-2">
                          <Badge tone={ACTION_TONE[r.action]}>{ACTION_TEXT[r.action]}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          {r.errors.length ? (
                            <ul className="space-y-0.5 text-danger">
                              {r.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-ink-2">{r.changes.join(' · ') || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result ? (
            <Notice tone={result.failed.length ? 'warning' : 'success'} title="Import finished">
              {result.created} created, {result.updated} updated, {result.unchanged} unchanged
              {result.failed.length ? `, ${result.failed.length} failed:` : '.'}
              {result.failed.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {result.failed.map((f) => (
                    <li key={f.row}>
                      Row {f.row} ({f.sku}): {f.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Notice>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {file && !result ? (
            <Button variant="outline" onClick={() => runPreview(file)} loading={pending && !preview} disabled={pending}>
              <FileUp /> Check again
            </Button>
          ) : null}
          {!result ? (
            <Button onClick={apply} loading={pending && Boolean(preview)} disabled={!preview || preview.counts.error > 0 || applicable === 0 || pending}>
              Apply {applicable || ''} change{applicable === 1 ? '' : 's'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
