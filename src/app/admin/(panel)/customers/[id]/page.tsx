import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/admin/orders';
import { REQUEST_STATUS_TEXT, REQUEST_TYPE_TEXT } from '@/lib/admin/operations';
import { OrderStatusBadge, PageHeader, Panel, PaymentStatusBadge } from '@/components/admin/ui';
import { BlockCustomerButton } from '@/components/admin/customers/customer-actions';
import { Stars } from '@/components/store/product-bits';
import { Badge, Notice } from '@/components/ui/misc';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage(ROLE_GROUPS.orders);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, addresses, orders, reviews, requests] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, phone, marketing_opt_in, marketing_opt_in_at, is_blocked, blocked_reason, created_at').eq('id', id).maybeSingle(),
    supabase.from('addresses').select('id, label, full_name, phone, line1, line2, city, state, postal_code, is_default').eq('user_id', id),
    supabase.from('orders').select('id, order_number, total, order_status, payment_status, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('reviews').select('id, rating, title, status, created_at, product:products(name)').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('customer_requests').select('id, request_type, status, created_at').eq('user_id', id).order('created_at', { ascending: false }),
  ]);
  if (!profile) notFound();

  return (
    <>
      <PageHeader
        back={{ href: '/admin/customers', label: 'Customers' }}
        title={profile.full_name || profile.email || 'Customer'}
        description={`Customer since ${formatDate(profile.created_at)}`}
        actions={<BlockCustomerButton id={profile.id} blocked={profile.is_blocked} />}
      />
      {profile.is_blocked ? <Notice tone="danger" title="Blocked from ordering" className="mb-6">{profile.blocked_reason}</Notice> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel title={`Orders (${orders.data?.length ?? 0})`}>
            {orders.data?.length ? (
              <ul className="divide-y divide-line text-sm">
                {orders.data.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold hover:underline">{o.order_number}</Link>
                    <span className="flex flex-wrap gap-1.5"><OrderStatusBadge status={o.order_status} /><PaymentStatusBadge status={o.payment_status} /></span>
                    <span className="tabular-nums">{formatMoney(o.total)}</span>
                    <span className="text-xs text-muted">{formatDateTime(o.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No orders yet.</p>}
          </Panel>
          <Panel title={`Reviews (${reviews.data?.length ?? 0})`}>
            {reviews.data?.length ? (
              <ul className="divide-y divide-line text-sm">
                {reviews.data.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span><Stars rating={r.rating} /> <span className="text-muted">{r.product?.name}</span>{r.title ? ` — ${r.title}` : ''}</span>
                    <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No reviews.</p>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Contact">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-muted">Email</dt><dd>{profile.email}</dd></div>
              <div><dt className="text-xs text-muted">Phone</dt><dd>{profile.phone ?? '—'}</dd></div>
              <div><dt className="text-xs text-muted">Marketing emails</dt><dd>{profile.marketing_opt_in ? `Opted in ${profile.marketing_opt_in_at ? formatDate(profile.marketing_opt_in_at) : ''}` : 'Not opted in'}</dd></div>
            </dl>
          </Panel>
          <Panel title="Addresses">
            {addresses.data?.length ? (
              <ul className="space-y-3 text-sm">
                {addresses.data.map((a) => (
                  <li key={a.id}>
                    <p className="font-medium">{a.label}{a.is_default ? ' · default' : ''}</p>
                    <p className="text-muted">{a.full_name}, {[a.line1, a.line2, a.city, a.state, a.postal_code].filter(Boolean).join(', ')} · {a.phone}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No saved addresses.</p>}
          </Panel>
          <Panel title="Requests">
            {requests.data?.length ? (
              <ul className="space-y-2 text-sm">
                {requests.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/admin/requests?highlight=${r.id}`} className="hover:underline">{REQUEST_TYPE_TEXT[r.request_type] ?? r.request_type}</Link>
                    <Badge tone="neutral">{REQUEST_STATUS_TEXT[r.status] ?? r.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No requests.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
