import type { Invoice, InvoiceItem, Organization, Payment, PortalSettings } from '@/lib/types';
import { date, money } from '@/lib/format';
import { LogoMark } from '@/components/ui/logo';
import { StatusBadge } from '@/components/ui/primitives';

// The invoice as a document: the same layout for the client and for the admin.
export function InvoiceDocument({ inv, items, payments, org, settings }: { inv: Invoice; items: InvoiceItem[]; payments: Payment[]; org: Organization; settings: PortalSettings }) {
  return (
    <div className="card overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-coral-600 via-coral-500 to-coral-300" />
      <div className="p-6 md:p-10">
        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div>
            <div className="flex items-center gap-2.5 text-fg"><span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-coral-500 text-ink-950"><LogoMark className="h-[10px]" /></span><span className="text-lg font-semibold">WeberAct</span></div>
            <div className="mt-4 space-y-0.5 text-[12.5px] text-fg-muted">
              <p className="text-fg-soft">{settings.legal_name || settings.agency_name}</p>
              {settings.address && <p className="whitespace-pre-line">{settings.address}</p>}
              {settings.tax_id && <p>Tax ID / GSTIN {settings.tax_id}</p>}
              {settings.email && <p>{settings.email}</p>}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="eyebrow !text-coral-400">{inv.status === 'draft' ? 'Draft invoice' : 'Invoice'}</p>
            <p className="num mt-1.5 text-[26px] font-semibold tracking-tight">{inv.number ?? 'Draft'}</p>
            <div className="mt-3"><StatusBadge status={inv.payment_status} /></div>
          </div>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div><p className="eyebrow mb-2">Billed to</p><p className="text-[14px] font-medium">{org.legal_name || org.name}</p>
            <p className="mt-1 text-[12.5px] whitespace-pre-line text-fg-muted">{[org.billing_address, org.country, org.tax_id && `Tax ID ${org.tax_id}`].filter(Boolean).join('\n')}</p></div>
          <div><p className="eyebrow mb-2">Issued</p><p className="text-[14px]">{date(inv.issue_date)}</p></div>
          <div><p className="eyebrow mb-2">Due</p><p className="text-[14px]">{date(inv.due_date)}</p></div>
          <div><p className="eyebrow mb-2">Balance due</p><p className="num text-[14px] font-semibold text-coral-400">{money(inv.balance, inv.currency)}</p></div>
        </div>
        <div className="mt-9 overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead><tr className="border-b border-line-strong text-left text-[11px] uppercase tracking-[0.1em] text-fg-faint">
              <th className="py-3 font-medium">Service</th><th className="py-3 text-right font-medium">Qty</th><th className="py-3 text-right font-medium">Unit price</th><th className="py-3 text-right font-medium">Tax</th><th className="py-3 text-right font-medium">Amount</th>
            </tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-line">
                  <td className="py-3.5 pr-4 text-fg-soft">{it.description}</td>
                  <td className="num py-3.5 text-right text-fg-muted">{Number(it.quantity)}</td>
                  <td className="num py-3.5 text-right text-fg-muted">{money(it.unit_price, inv.currency)}</td>
                  <td className="num py-3.5 text-right text-fg-muted">{Number(it.tax_rate)}%</td>
                  <td className="num py-3.5 text-right text-fg">{money(it.amount, inv.currency)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-fg-faint">No items yet</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-end">
          <dl className="num w-full max-w-xs space-y-2 text-[13.5px]">
            <div className="flex justify-between text-fg-muted"><dt>Subtotal</dt><dd>{money(inv.subtotal, inv.currency)}</dd></div>
            <div className="flex justify-between text-fg-muted"><dt>Tax</dt><dd>{money(inv.tax_total, inv.currency)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><dt>Total</dt><dd>{money(inv.total, inv.currency)}</dd></div>
            <div className="flex justify-between text-fg-muted"><dt>Paid</dt><dd>{money(inv.amount_paid, inv.currency)}</dd></div>
            <div className="flex justify-between text-[15px] font-semibold text-coral-400"><dt>Balance due</dt><dd>{money(inv.balance, inv.currency)}</dd></div>
          </dl>
        </div>
        {payments.length > 0 && (
          <div className="mt-9 border-t border-line pt-6">
            <p className="eyebrow mb-3">Payments received</p>
            <ul className="space-y-2 text-[13px]">
              {payments.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-2 text-fg-soft"><span>{date(p.paid_at)} · {p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}</span><span className="num">{money(p.amount, inv.currency)}</span></li>)}
            </ul>
          </div>
        )}
        {inv.notes && <p className="mt-8 border-t border-line pt-6 text-[13px] whitespace-pre-line text-fg-muted">{inv.notes}</p>}
      </div>
    </div>
  );
}
