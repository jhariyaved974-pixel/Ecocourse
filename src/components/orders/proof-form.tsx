'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ImageUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Notice } from '@/components/ui/misc';
import { formatMoney } from '@/lib/utils';

const MAX = 4 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

const noopSubscribe = () => () => {};

function localNow() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ProofForm({ orderNumber, amount, upiId, requireProof, late }: { orderNumber: string; amount: number; upiId: string; requireProof: boolean; late: boolean }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [paidAtInput, setPaidAt] = React.useState<string | null>(null);
  // Pre-fill "now" only in the browser (the server does not know the shopper's time zone).
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const initialPaidAt = React.useMemo(() => (mounted ? localNow() : ''), [mounted]);
  const paidAt = paidAtInput ?? initialPaidAt;
  React.useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (f: File | null) => {
    setFieldErrors((e) => ({ ...e, file: '' }));
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!f) return setFile(null);
    if (!ACCEPT.split(',').includes(f.type)) {
      setFieldErrors((e) => ({ ...e, file: 'Choose a JPG, PNG or WebP screenshot, or a PDF receipt.' }));
      return setFile(null);
    }
    if (f.size > MAX) {
      setFieldErrors((e) => ({ ...e, file: 'This file is larger than 4 MB.' }));
      return setFile(null);
    }
    setFile(f);
    if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);
    if (requireProof && !file) {
      setFieldErrors({ file: 'Please upload your payment screenshot or receipt.' });
      return;
    }
    form.delete('file');
    if (file) form.set('file', file);
    const local = String(form.get('paidAtLocal') ?? '');
    form.delete('paidAtLocal');
    const when = local ? new Date(local) : null;
    if (!when || Number.isNaN(when.getTime())) {
      setFieldErrors({ paidAt: 'Enter when you made the payment.' });
      return;
    }
    form.set('paidAt', when.toISOString());

    // XHR (not fetch) so we can show upload progress on slow connections.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/orders/${encodeURIComponent(orderNumber)}/payment-proof`);
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: { ok?: boolean; error?: string; fieldErrors?: Record<string, string> } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.ok) {
        router.refresh();
        return;
      }
      setError(body.error ?? 'Upload failed. Please try again.');
      setFieldErrors(body.fieldErrors ?? {});
    };
    xhr.onerror = () => {
      setProgress(null);
      setError('Connection problem. Please check your internet and try again.');
    };
    setProgress(0);
    xhr.send(form);
  };

  const busy = progress !== null;
  return (
    <section className="rounded-[var(--radius)] border border-line bg-surface p-6" aria-labelledby="proof-heading">
      <h2 id="proof-heading" className="text-lg font-semibold">Already paid? Submit your payment details</h2>
      <p className="mt-1 text-sm text-muted">
        {late
          ? 'Your reservation has expired. If you already paid, submit the details below — our team will check the payment and either confirm your order (if stock allows) or arrange a full refund.'
          : 'This helps us match your payment quickly. It does not confirm the order by itself: we verify every payment in our bank records first.'}
      </p>
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label={`Payment screenshot or receipt${requireProof ? '' : ' (recommended)'}`} htmlFor="proof-file" error={fieldErrors.file} required={requireProof} hint="JPG, PNG, WebP or PDF up to 4 MB. Make sure the amount, date and UTR are visible.">
          {file ? (
            <div className="flex items-center gap-4 rounded-xl border border-line p-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Selected payment screenshot" className="size-16 rounded-lg object-cover" />
              ) : (
                <div className="grid size-16 place-items-center rounded-lg bg-surface-2"><FileText className="size-6 text-muted" /></div>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button type="button" onClick={() => pick(null)} className="grid size-8 place-items-center rounded-full hover:bg-surface-2" aria-label="Remove file" disabled={busy}>
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label htmlFor="proof-file" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-8 text-center text-sm transition-colors hover:border-ink">
              <ImageUp className="size-6 text-muted" />
              <span className="font-medium">Choose a file</span>
              <span className="text-xs text-muted">or take a screenshot in your UPI app’s payment history</span>
            </label>
          )}
          <input id="proof-file" name="file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={busy} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="UTR / UPI reference number" htmlFor="utr" error={fieldErrors.utr} required={!requireProof} hint="12-digit number shown as UTR, UPI Ref No. or RRN in your app.">
            <Input id="utr" name="utr" inputMode="text" autoComplete="off" maxLength={35} placeholder="e.g. 412345678901" className="font-mono uppercase placeholder:font-sans placeholder:normal-case" aria-invalid={Boolean(fieldErrors.utr)} />
          </Field>
          <Field label="Date & time of payment" htmlFor="paidAtLocal" error={fieldErrors.paidAt} required>
            <Input id="paidAtLocal" name="paidAtLocal" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-invalid={Boolean(fieldErrors.paidAt)} />
          </Field>
          <Field label="Your UPI ID (optional)" htmlFor="payerUpiId" error={fieldErrors.payerUpiId} hint="Helps us find your payment faster.">
            <Input id="payerUpiId" name="payerUpiId" autoComplete="off" maxLength={255} placeholder="name@bank" />
          </Field>
          <Field label="Note (optional)" htmlFor="note" error={fieldErrors.note}>
            <Textarea id="note" name="note" rows={1} maxLength={500} />
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-[var(--ink)]" />
          <span>
            I confirm I have paid <strong>{formatMoney(amount)}</strong> to <span className="font-mono">{upiId}</span> for order <span className="font-mono">{orderNumber}</span>.
          </span>
        </label>
        {fieldErrors.confirm ? <p className="-mt-3 text-xs font-medium text-danger" role="alert">{fieldErrors.confirm}</p> : null}
        {busy ? (
          <div className="space-y-1" role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted">{progress! < 100 ? `Uploading… ${progress}%` : 'Checking your file…'}</p>
          </div>
        ) : null}
        <Button type="submit" size="lg" loading={busy}>Submit payment details</Button>
        <p className="text-xs text-muted">Never share your UPI PIN or OTP. We only need the screenshot and reference number.</p>
      </form>
    </section>
  );
}
