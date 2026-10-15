import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Download } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ADMIN_PAGE_SIZE, sanitizeSearch } from '@/lib/admin/orders';
import { CUSTOMER_FILTERS } from '@/lib/admin/operations';
import { firstParam, PageHeader, Pagination, parsePage, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';
import { DeleteSubscriberButton } from '@/components/admin/customers/customer-actions';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn, formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.orders);
  const isAdmin = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const sp = await searchParams;
  const view = firstParam(sp.view) === 'subscribers' && isAdmin ? 'subscribers' : 'customers';
  const q = sanitizeSearch(firstParam(sp.q));
  const filterParam = firstParam(sp.filter) ?? '';
  const filter = CUSTOMER_FILTERS.some((f) => f.value === filterParam) ? filterParam : '';
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();

  const tabs = (
    <nav aria-label="Customer views" className="mb-5 flex gap-1">
      <Link href="/admin/customers" aria-current={view === 'customers' ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', view === 'customers' ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>Customers</Link>
      {isAdmin ? (
        <Link href="/admin/customers?view=subscribers" aria-current={view === 'subscribers' ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', view === 'subscribers' ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>Newsletter subscribers</Link>
      ) : null}
    </nav>
  );

  if (view === 'subscribers') {
    let sq = supabase.from('newsletter_subscribers').select('id, email, status, source, created_at, unsubscribed_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
    if (q) sq = sq.ilike('email', `%${q}%`);
    const { data, count } = await sq;
    return (
      <>
        <PageHeader
          title="Customers"
          description="People who opted in to marketing emails. Only active subscribers are exported."
          actions={
            <Button asChild variant="outline" size="sm">
              <a href="/admin/customers/subscribers/export" download><Download /> Export subscribers</a>
            </Button>
          }
        />
        {tabs}
        <div className="mb-4"><Suspense><SearchParamInput placeholder="Search email" /></Suspense></div>
        {!data?.length ? <EmptyState title="No subscribers" /> : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Email</Th><Th>Status</Th><Th>Source</Th><Th>Since</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.email}</Td>
                    <Td><Badge tone={s.status === 'subscribed' ? 'success' : 'neutral'}>{s.status}</Badge></Td>
                    <Td className="text-muted">{s.source}</Td>
                    <Td className="text-muted">{formatDate(s.created_at)}</Td>
                    <Td className="text-right"><DeleteSubscriberButton id={s.id} email={s.email} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
        <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE))} basePath="/admin/customers" params={{ view, q: q || undefined }} />
      </>
    );
  }

  const { data } = await supabase.rpc('admin_list_customers', { p_query: q || undefined, p_filter: filter || undefined, p_limit: ADMIN_PAGE_SIZE, p_offset: (page - 1) * ADMIN_PAGE_SIZE });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  return (
    <>
      <PageHeader title="Customers" description="Registered customer accounts. Guest orders are listed under Orders." />
      {tabs}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <SearchParamInput placeholder="Search name, email or phone" />
          <SearchParamSelect param="filter" label="Filter" options={CUSTOMER_FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        </Suspense>
        <p className="text-sm text-muted">{total} customer{total === 1 ? '' : 's'}</p>
      </div>
      {rows.length === 0 ? <EmptyState title="No customers found" /> : (
        <TableWrap>
          <Table>
            <thead><tr><Th>Customer</Th><Th>Phone</Th><Th className="text-right">Orders</Th><Th className="text-right">Paid</Th><Th>Last order</Th><Th>Joined</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">{c.full_name || c.email}</Link>
                    <span className="block text-xs text-muted">{c.email}</span>
                    <span className="mt-1 flex gap-1">
                      {c.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
                      {c.marketing_opt_in ? <Badge tone="neutral">Marketing</Badge> : null}
                    </span>
                  </Td>
                  <Td className="text-muted">{c.phone ?? '—'}</Td>
                  <Td className="text-right tabular-nums">{c.order_count}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(Number(c.paid_total))}</Td>
                  <Td className="text-muted">{c.last_order_at ? formatDate(c.last_order_at) : '—'}</Td>
                  <Td className="text-muted">{formatDate(c.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))} basePath="/admin/customers" params={{ q: q || undefined, filter: filter || undefined }} />
    </>
  );
}
