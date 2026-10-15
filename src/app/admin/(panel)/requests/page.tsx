import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/orders';
import { REQUEST_STATUS_TEXT, REQUEST_TYPE_TEXT } from '@/lib/admin/operations';
import { firstParam, PageHeader, Pagination, parsePage } from '@/components/admin/ui';
import { RequestForm } from '@/components/admin/requests/request-form';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { cn, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Customer requests' };

const VIEWS = [
  { value: 'open', label: 'Open', statuses: ['open', 'in_progress'] },
  { value: 'closed', label: 'Closed', statuses: ['resolved', 'rejected'] },
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.orders);
  const isAdmin = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === firstParam(sp.view)) ?? VIEWS[0];
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from('customer_requests')
    .select('id, user_id, email, request_type, message, status, resolution_note, created_at, resolved_at', { count: 'exact' })
    .in('status', [...view.statuses])
    .order('created_at', { ascending: view.value === 'open' })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Customer requests" description="Order problems, personal-data copies and account deletion requests from signed-in customers." />
      <nav aria-label="Request views" className="mb-5 flex gap-1">
        {VIEWS.map((v) => (
          <Link key={v.value} href={`/admin/requests?view=${v.value}`} aria-current={v.value === view.value ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', v.value === view.value ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>
            {v.label}
          </Link>
        ))}
      </nav>
      {!data?.length ? <EmptyState title={view.value === 'open' ? 'No open requests' : 'No closed requests'} /> : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id} id={r.id} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {REQUEST_TYPE_TEXT[r.request_type] ?? r.request_type}
                    <Badge tone={r.status === 'resolved' ? 'success' : r.status === 'rejected' ? 'danger' : r.status === 'in_progress' ? 'info' : 'warning'}>{REQUEST_STATUS_TEXT[r.status] ?? r.status}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.user_id ? <Link href={`/admin/customers/${r.user_id}`} className="underline">{r.email}</Link> : r.email} · {formatDateTime(r.created_at)}
                  </p>
                </div>
                {isAdmin && r.user_id && (r.request_type === 'data_export' || r.request_type === 'account_deletion') ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/admin/requests/${r.id}/export`} download><Download /> Customer data (JSON)</a>
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-sm whitespace-pre-line text-ink-2">{r.message}</p>
              <div className="mt-4 border-t border-line pt-4">
                <RequestForm id={r.id} status={r.status} note={r.resolution_note} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE))} basePath="/admin/requests" params={{ view: view.value }} />
    </>
  );
}
