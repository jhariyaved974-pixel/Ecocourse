import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeSearch } from '@/lib/admin/orders';
import { firstParam, PageHeader, Pagination, parsePage } from '@/components/admin/ui';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';
import { Badge, EmptyState } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE = 50;
const ENTITY_TYPES = [
  'order', 'product', 'products', 'product_costs', 'inventory', 'categories', 'brands', 'collection', 'collections', 'media_assets', 'reviews',
  'coupons', 'customer', 'customer_request', 'homepage', 'pages', 'navigation_links', 'announcements', 'size_guides',
  'store_settings', 'payment_settings', 'shipping_methods', 'tax_settings', 'tax_rules', 'staff_members', 'security_settings',
];
const RANGES = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

/** ISO timestamp `days` days before the request time (kept out of the component body). */
function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.admin);
  const sp = await searchParams;
  const q = sanitizeSearch(firstParam(sp.q));
  const entity = ENTITY_TYPES.includes(firstParam(sp.entity) ?? '') ? firstParam(sp.entity)! : '';
  const days = RANGES.some((r) => r.value === firstParam(sp.days)) ? firstParam(sp.days) ?? '' : '';
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('audit_logs')
    .select('id, actor_email, actor_role, action, entity_type, entity_id, summary, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (entity) query = query.eq('entity_type', entity);
  if (days) query = query.gte('created_at', since(Number(days)));
  if (q) query = query.or(`action.ilike.%${q}%,actor_email.ilike.%${q}%,summary.ilike.%${q}%,entity_id.ilike.%${q}%`);
  const { data, count } = await query;

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of staff and system changes. Entries cannot be edited or deleted from the app." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <SearchParamInput placeholder="Search action, person, summary or id" />
          <SearchParamSelect param="entity" label="Area" options={[{ value: '', label: 'All areas' }, ...ENTITY_TYPES.map((e) => ({ value: e, label: e.replace(/_/g, ' ') }))]} />
          <SearchParamSelect param="days" label="Time range" options={RANGES} />
        </Suspense>
        <p className="text-sm text-muted">{count ?? 0} entries</p>
      </div>
      {!data?.length ? <EmptyState title="No matching entries" /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {data.map((a) => (
            <li key={a.id} className="px-4 py-3 text-sm">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge tone="neutral" className="font-mono">{a.action}</Badge>
                  <span className="min-w-0 flex-1 truncate">{a.summary || `${a.entity_type}${a.entity_id ? ` ${a.entity_id}` : ''}`}</span>
                  <span className="text-xs text-muted">{a.actor_email ?? 'System'}{a.actor_role ? ` (${a.actor_role})` : ''} · {formatDateTime(a.created_at)}</span>
                </summary>
                <div className="mt-2 rounded-lg bg-surface-2 p-3">
                  <p className="text-xs text-muted">{a.entity_type}{a.entity_id ? ` · ${a.entity_id}` : ''}</p>
                  {/* Rendered as text: React escapes it. */}
                  <pre className="mt-2 max-h-80 overflow-auto text-xs whitespace-pre-wrap break-all">{JSON.stringify(a.details, null, 2)}</pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / PAGE))} basePath="/admin/audit" params={{ q: q || undefined, entity: entity || undefined, days: days || undefined }} />
    </>
  );
}
