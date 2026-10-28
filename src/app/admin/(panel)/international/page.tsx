import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/orders';
import { BUYER_TYPES, countryName, LEAD_STATUS_TEXT } from '@/lib/international';
import { firstParam, PageHeader, Pagination, parsePage, StatCard } from '@/components/admin/ui';
import { LeadForm } from '@/components/admin/international/lead-form';
import { Badge, EmptyState } from '@/components/ui/misc';
import { cn, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'International leads' };

const VIEWS = [
  { value: 'open', label: 'To follow up', statuses: ['new', 'contacted'] },
  { value: 'converted', label: 'Converted', statuses: ['converted'] },
  { value: 'closed', label: 'Closed', statuses: ['closed'] },
] as const;

const BUYER_TEXT: Record<string, string> = Object.fromEntries(BUYER_TYPES.map((b) => [b.value, b.label]));

export default async function InternationalLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage(ROLE_GROUPS.orders);
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === firstParam(sp.view)) ?? VIEWS[0];
  const page = parsePage(sp.page);
  const supabase = await createSupabaseServerClient();
  const [{ data, count }, { data: all }] = await Promise.all([
    supabase
      .from('international_leads')
      .select('id, full_name, email, phone, country_code, detected_country, buyer_type, interest, message, source_path, status, admin_note, created_at', { count: 'exact' })
      .in('status', [...view.statuses])
      .order('created_at', { ascending: false })
      .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1),
    supabase.from('international_leads').select('country_code, status').order('created_at', { ascending: false }).limit(2000),
  ]);

  // Which countries ask most: the best signal for where to open shipping next.
  const byCountry = new Map<string, number>();
  for (const l of all ?? []) byCountry.set(l.country_code, (byCountry.get(l.country_code) ?? 0) + 1);
  const top = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const fresh = (all ?? []).filter((l) => l.status === 'new').length;

  return (
    <>
      <PageHeader
        title="International leads"
        description="Shoppers outside India who asked for delivery to their country. You get an email for each new lead; reply to it to reach the shopper directly."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="New, not contacted" value={fresh} tone={fresh ? 'warning' : undefined} />
        <StatCard label="All leads" value={all?.length ?? 0} />
        <StatCard label="Top countries" value={top.length ? top.map(([c, n]) => `${c} ${n}`).join(' · ') : '—'} hint={top[0] ? countryName(top[0][0]) : undefined} />
      </div>
      <nav aria-label="Lead views" className="mb-5 flex gap-1">
        {VIEWS.map((v) => (
          <Link key={v.value} href={`/admin/international?view=${v.value}`} aria-current={v.value === view.value ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5 text-sm', v.value === view.value ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>
            {v.label}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <EmptyState title="No leads here yet" description="Visitors outside India see a banner linking to /international, which is also in the footer." />
      ) : (
        <ul className="space-y-3">
          {data.map((l) => (
            <li key={l.id} id={l.id} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {l.full_name}
                    <Badge tone={l.status === 'converted' ? 'success' : l.status === 'closed' ? 'danger' : l.status === 'contacted' ? 'info' : 'warning'}>{LEAD_STATUS_TEXT[l.status] ?? l.status}</Badge>
                    <span className="text-sm text-muted">{countryName(l.country_code)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <a href={`mailto:${l.email}`} className="underline">{l.email}</a>
                    {l.phone ? ` · ${l.phone}` : ''} · {BUYER_TEXT[l.buyer_type] ?? l.buyer_type} · {formatDateTime(l.created_at)}
                    {l.detected_country && l.detected_country !== l.country_code ? ` · browsing from ${countryName(l.detected_country)}` : ''}
                  </p>
                </div>
              </div>
              {l.interest ? <p className="mt-3 text-sm"><span className="text-muted">Interested in:</span> {l.interest}</p> : null}
              {l.message ? <p className="mt-2 text-sm whitespace-pre-line text-ink-2">{l.message}</p> : null}
              <div className="mt-4 border-t border-line pt-4">
                <LeadForm id={l.id} status={l.status} note={l.admin_note} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGE_SIZE))} basePath="/admin/international" params={{ view: view.value }} />
    </>
  );
}
