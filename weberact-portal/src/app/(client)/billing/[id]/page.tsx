import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Download, ExternalLink } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { paymentConfig } from '@/lib/payments';
import type { Invoice, InvoiceItem, Payment, PortalSettings } from '@/lib/types';
import { money } from '@/lib/format';
import { Button, Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { InvoiceDocument } from '@/components/portal/invoice-document';
import { PayButtons } from '@/components/portal/pay-buttons';
import { RealtimeRefresh } from '@/components/portal/realtime-refresh';

export const metadata: Metadata = { title: 'Invoice' };
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { id } = await params; const { paid } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await requireClient();
  const sb = v.supabase;
  const { data } = await sb.from('invoice_summaries').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice;
  const [{ data: items }, { data: payments }, { data: settings }] = await Promise.all([
    sb.from('invoice_items').select('*').eq('invoice_id', id).order('position'),
    sb.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
    sb.from('portal_settings').select('*').eq('id', 1).single(),
  ]);
  const cfg = paymentConfig();
  const s = settings as PortalSettings;
  const open = inv.status === 'issued' && Number(inv.balance) > 0;
  return (
    <>
      <RealtimeRefresh channel={'invoice-' + id} tables={['invoices']} filter={`id=eq.${id}`} />
      <PageHeader eyebrow="Invoice" title={inv.number ?? 'Invoice'}
        actions={<>
          <Button variant="secondary" href={`/api/invoices/${id}/pdf`} external><ExternalLink className="h-4 w-4" /> View PDF</Button>
          <Button variant="secondary" href={`/api/invoices/${id}/pdf?download=1`} external><Download className="h-4 w-4" /> Download PDF</Button>
        </>} />
      {paid && open && <p className="mb-5 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3 text-[13.5px] text-info">Thank you. Your payment is being confirmed and will appear here in a moment.</p>}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <InvoiceDocument inv={inv} items={(items ?? []) as InvoiceItem[]} payments={(payments ?? []) as Payment[]} org={v.organization} settings={s} />
        <div className="space-y-6">
          <Card>
            <CardHeader title={open ? 'Pay this invoice' : 'Payment'} description={open ? `${money(inv.balance, inv.currency)} due` : inv.payment_status === 'paid' ? 'Paid in full. Thank you.' : undefined} />
            <div className="space-y-5 px-6 pb-6">
              {open && <PayButtons invoiceId={id} razorpay={cfg.razorpay} stripe={cfg.stripe} currency={inv.currency} />}
              {open && s.payment_instructions && (
                <div><p className="eyebrow mb-2">Bank transfer</p><p className="rounded-xl border border-line bg-white/[0.02] p-4 text-[13px] leading-relaxed whitespace-pre-line text-fg-soft">{s.payment_instructions}</p>
                  <p className="mt-2 text-[12px] text-fg-faint">Quote {inv.number} as the reference. WeberAct records the payment when it arrives.</p></div>
              )}
              {open && !s.payment_instructions && !cfg.razorpay && !cfg.stripe && <p className="text-[13px] text-fg-muted">Payment details are on the PDF, or message the team for them.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
