import type { Metadata } from 'next';
import { requireUserPage } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStoreSettings } from '@/lib/content/queries';
import { publicEnv } from '@/lib/env';
import { AFFILIATE_STATUS_TEXT, COMMISSION_STATUS_TEXT, formatRate } from '@/lib/affiliates';
import { AffiliateForm, CopyLink } from '@/components/account/affiliate-form';
import { Badge, Notice } from '@/components/ui/misc';
import { formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Affiliate program' };

export default async function AffiliatePage() {
  const user = await requireUserPage('/account/affiliate');
  const supabase = await createSupabaseServerClient();
  const [settings, { data: affiliate }] = await Promise.all([
    getStoreSettings(),
    supabase.from('affiliates').select('*').eq('user_id', user.id).maybeSingle(),
  ]);
  const rate = affiliate?.commission_bps ?? settings.affiliate_commission_bps;

  if (!affiliate) {
    return (
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold">Earn with {settings.store_name}</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Share your personal link. When someone buys through it within {settings.affiliate_cookie_days} days, you earn {formatRate(rate)} of the
            order value (excluding shipping and taxes). Commission is confirmed once the order is delivered and fully paid, and paid to your UPI ID.
          </p>
        </section>
        {settings.affiliate_enabled ? <AffiliateForm submitLabel="Apply to join" /> : <Notice tone="info">The affiliate program is closed right now.</Notice>}
      </div>
    );
  }

  const [{ data: commissions }, { data: payouts }] = await Promise.all([
    supabase.from('affiliate_commissions').select('id, order_number, base_amount, rate_bps, amount, status, created_at').eq('affiliate_id', affiliate.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('affiliate_payouts').select('id, amount, reference, paid_at').eq('affiliate_id', affiliate.id).order('paid_at', { ascending: false }).limit(20),
  ]);
  const sum = (status: string) => (commissions ?? []).filter((c) => c.status === status).reduce((t, c) => t + c.amount, 0);
  const link = `${publicEnv.siteUrl}/r/${affiliate.code}`;

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">Affiliate program</h2>
          <Badge tone={affiliate.status === 'approved' ? 'success' : affiliate.status === 'pending' ? 'warning' : 'danger'}>{AFFILIATE_STATUS_TEXT[affiliate.status] ?? affiliate.status}</Badge>
        </div>
        {affiliate.status === 'approved' ? (
          <>
            <p className="max-w-xl text-sm text-muted">Share this link. You earn {formatRate(rate)} on orders placed within {settings.affiliate_cookie_days} days of a click. To link to a product, add <code>?to=/products/…</code>.</p>
            <CopyLink value={link} />
          </>
        ) : affiliate.status === 'pending' ? (
          <Notice tone="info">Thanks for applying. Your referral link appears here once we approve your application.</Notice>
        ) : affiliate.status === 'rejected' ? (
          <Notice tone="warning">Your application was not approved{affiliate.admin_note ? `: ${affiliate.admin_note}` : '.'} You can update your details and apply again.</Notice>
        ) : (
          <Notice tone="danger">Your affiliate account is suspended{affiliate.admin_note ? `: ${affiliate.admin_note}` : '.'} Please contact support.</Notice>
        )}
      </section>

      {affiliate.status === 'approved' ? (
        <section className="grid gap-3 sm:grid-cols-4">
          {[
            ['Clicks', String(affiliate.clicks)],
            ['Pending', formatMoney(sum('pending'))],
            ['Earned (to be paid)', formatMoney(sum('approved'))],
            ['Paid', formatMoney(sum('paid'))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[var(--radius)] border border-line bg-surface p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {commissions?.length ? (
        <section>
          <h3 className="font-semibold">Referred orders</h3>
          <ul className="mt-3 divide-y divide-line text-sm">
            {commissions.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  {c.order_number} · <span className="text-muted">{formatDate(c.created_at)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={c.status === 'paid' || c.status === 'approved' ? 'success' : c.status === 'cancelled' ? 'danger' : 'neutral'}>{COMMISSION_STATUS_TEXT[c.status] ?? c.status}</Badge>
                  <span className="font-medium">{formatMoney(c.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {payouts?.length ? (
        <section>
          <h3 className="font-semibold">Payouts</h3>
          <ul className="mt-3 divide-y divide-line text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-3">
                <span>{formatDate(p.paid_at)} · <span className="text-muted">Ref {p.reference}</span></span>
                <span className="font-medium">{formatMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-line pt-8">
        <h3 className="font-semibold">Payout details</h3>
        <div className="mt-4">
          <AffiliateForm upi={affiliate.payout_upi_id} note={affiliate.promotion_note} submitLabel={affiliate.status === 'rejected' ? 'Apply again' : 'Save'} />
        </div>
      </section>
    </div>
  );
}
