'use client';

import * as React from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { importInventory, type ImportResult } from '@/app/admin/(panel)/inventory/actions';
import { useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

type Row = { sku: string; quantity: string };

export function InventoryImport() {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'set' | 'add'>('set');
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const { run, pending } = useActionRunner();

  const reset = () => {
    setRows(null);
    setResult(null);
    setParseError(null);
  };

  const onFile = (file: File | undefined) => {
    reset();
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setParseError('The file is larger than 2 MB.');
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (out) => {
        const fields = out.meta.fields ?? [];
        const qtyField = ['quantity', 'on_hand', 'stock', 'qty'].find((f) => fields.includes(f));
        if (!fields.includes('sku') || !qtyField) {
          setParseError('The CSV needs a "sku" column and a "quantity" (or "on_hand") column.');
          return;
        }
        setRows(out.data.map((r) => ({ sku: String(r.sku ?? '').trim(), quantity: String(r[qtyField] ?? '').trim() })));
      },
      error: () => setParseError('Could not read this CSV file.'),
    });
  };

  const submit = async (dryRun: boolean) => {
    if (!rows) return;
    const res = await run(() => importInventory({ rows, mode, dryRun }), { refresh: !dryRun, success: dryRun ? 'Checked — review the changes below' : undefined });
    if (res.ok) {
      setResult(res.data);
      if (res.data.applied) {
        setOpen(false);
        reset();
      }
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import stock from CSV</DialogTitle>
            <DialogDescription>Columns: <code>sku</code>, <code>quantity</code>. The file is checked first; nothing changes until you apply it. Stock can never drop below units reserved by unpaid orders.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2" role="radiogroup" aria-label="Import mode">
              {(['set', 'add'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setResult(null); }} className={cn('rounded-full border px-3.5 py-1.5 text-sm', mode === m ? 'border-ink bg-ink text-paper' : 'border-line-strong')}>
                  {m === 'set' ? 'Quantities are the new on-hand counts' : 'Quantities are added (restock)'}
                </button>
              ))}
            </div>
            <Field label="CSV file" htmlFor="inventory-csv">
              <Input id="inventory-csv" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            </Field>
            {parseError ? <Notice tone="danger">{parseError}</Notice> : null}
            {rows ? <p className="text-sm text-muted">{rows.length} row(s) read.</p> : null}
            {result ? (
              <div className="space-y-3">
                {result.errors.length ? (
                  <Notice tone="danger" title={`${result.errors.length} row(s) need fixing — nothing will be applied until the file is clean`}>
                    <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4 text-xs">
                      {result.errors.slice(0, 100).map((e) => (
                        <li key={`${e.row}-${e.sku}`}>Row {e.row}{e.sku ? ` (${e.sku})` : ''}: {e.message}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : (
                  <Notice tone="success" title={`${result.changes.length} variant(s) will change`}>
                    <ul className="mt-1 max-h-48 overflow-y-auto font-mono text-xs">
                      {result.changes.slice(0, 200).map((c) => (
                        <li key={c.sku}>{c.sku}: {c.from} → {c.to}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            {result && !result.errors.length && result.changes.length ? (
              <Button loading={pending} onClick={() => submit(false)}>Apply {result.changes.length} change(s)</Button>
            ) : (
              <Button loading={pending} disabled={!rows} onClick={() => submit(true)}>Check file</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
