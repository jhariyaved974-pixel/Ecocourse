import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStoreSettings } from '@/lib/content/queries';
import { AFFILIATE_STATUS_TEXT, COMMISSION_STATUS_TEXT, formatRate } from '@/lib/affiliates';
import { firstParam, PageHeader, Panel, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { AffiliatePayoutButton, AffiliateReviewForm, AffiliateSettingsForm, CancelCommissionButton } from '@/components/admin/affiliates/affiliate-controls';
import { Badge, EmptyState } from '@/components/ui/misc';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Affiliates' };

const VIEWS = [
  { value: 'pending', label: 'Applications' },
  { value: 'approved', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
] as const;

export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.admin);
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === firstParam(sp.view)) ?? VIEWS[0];
  const supabase = await createSupabaseServerClient();
  const [settings, { data: affiliates }, { data: recent }] = await Promise.all([
    getStoreSettings(),
    supabase.rpc('admin_list_affiliates', { p_status: view.value }),
    supabase
      .from('affiliate_commissions')
      .select('id, order_id, order_number, amount, rate_bps, status, created_at, affiliates(code)')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  return (
    <>
      <PageHeader
        title="Affiliates"
        description="Partners who share referral links. Commission is earned on orders that are delivered and fully paid, and paid out manually by UPI."
      />
      <Panel title="Program settings" className="mb-6">
        <AffiliateSettingsForm
          enabled={settings.affiliate_enabled}
          ratePercent={settings.affiliate_commission_bps / 100}
          cookieDays={settings.affiliate_cookie_days}
          minPayoutRupees={settings.affiliate_min_payout / 100}
        />
      </Panel>

      <nav aria-label="Affiliate views" className="mb-5 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link key={v.value} href={`/admin/affiliates?view=${v.value}`} aria-current={v.value === view.value ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', v.value === view.value ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>
            {v.label}
          </Link>
        ))}
      </nav>

      {!affiliates?.length ? (
        <EmptyState title={view.value === 'pending' ? 'No applications waiting' : `No ${view.label.toLowerCase()} affiliates`} description="Shoppers apply from Account → Affiliate on the store." />
      ) : (
        <ul className="space-y-3">
          {affiliates.map((a) => {
            const ready = a.approved_amount >= settings.affiliate_min_payout && a.approved_amount > 0;
            return (
              <li key={a.id} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {a.full_name || a.email}
                      <Badge tone={a.status === 'approved' ? 'success' : a.status === 'pending' ? 'warning' : 'danger'}>{AFFILIATE_STATUS_TEXT[a.status] ?? a.status}</Badge>
                      <code className="text-xs text-muted">{a.code}</code>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      <Link href={`/admin/customers/${a.user_id}`} className="underline">{a.email}</Link> · UPI {a.payout_upi_id} · applied {formatDate(a.created_at)} ·{' '}
                      {formatRate(a.commission_bps ?? settings.affiliate_commission_bps)}{a.commission_bps === null ? ' (default)' : ''}
                    </p>
                    {a.promotion_note ? <p className="mt-2 text-sm text-ink-2">“{a.promotion_note}”</p> : null}
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{a.clicks} clicks · {a.orders} orders</p>
                    <p>Pending {formatMoney(a.pending_amount)} · Paid {formatMoney(a.paid_amount)}</p>
                    <p className="mt-1 text-sm font-semibold text-ink">To pay {formatMoney(a.approved_amount)}</p>
                    {a.approved_amount > 0 ? (
                      <div className="mt-2">
                        <AffiliatePayoutButton id={a.id} amountText={formatMoney(a.approved_amount)} upi={a.payout_upi_id} />
                        {!ready ? <p className="mt-1">Below the {formatMoney(settings.affiliate_min_payout)} minimum</p> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-4">
                  <AffiliateReviewForm id={a.id} status={a.status} ratePercent={a.commission_bps === null ? null : a.commission_bps / 100} note={a.admin_note} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Panel title="Recent referred orders" className="mt-8">
        {!recent?.length ? (
          <p className="text-sm text-muted">No referred orders yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Affiliate</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Commission</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <Td><Link href={`/admin/orders/${c.order_id}`} className="underline">{c.order_number}</Link></Td>
                    <Td><code className="text-xs">{(c.affiliates as { code: string } | null)?.code ?? '—'}</code></Td>
                    <Td>{formatDate(c.created_at)}</Td>
                    <Td><Badge tone={c.status === 'paid' || c.status === 'approved' ? 'success' : c.status === 'cancelled' ? 'danger' : 'neutral'}>{COMMISSION_STATUS_TEXT[c.status] ?? c.status}</Badge></Td>
                    <Td className="text-right">{formatMoney(c.amount)} <span className="text-xs text-muted">({formatRate(c.rate_bps)})</span></Td>
                    <Td className="text-right">{c.status === 'pending' || c.status === 'approved' ? <CancelCommissionButton id={c.id} orderNumber={c.order_number} /> : null}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </>
  );
}
