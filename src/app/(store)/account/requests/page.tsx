import type { Metadata } from 'next';
import { requireUserPage } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RequestForm } from '@/components/account/request-form';
import { Badge } from '@/components/ui/misc';
import { formatDate, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Help & privacy' };

const TYPE_LABEL: Record<string, string> = {
  order_issue: 'Order issue',
  data_export: 'Data copy',
  account_deletion: 'Account deletion',
  other: 'Other',
};

export default async function RequestsPage() {
  await requireUserPage('/account/requests');
  const supabase = await createSupabaseServerClient();
  const { data: requests } = await supabase
    .from('customer_requests')
    .select('id, request_type, message, status, resolution_note, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-xl font-semibold">Contact us</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Ask about an order, request a copy of your data, or ask us to delete your account. Order records we must keep for tax law are retained, but
          detached from your account.
        </p>
        <div className="mt-6">
          <RequestForm />
        </div>
      </section>
      {requests?.length ? (
        <section className="border-t border-line pt-8">
          <h2 className="text-xl font-semibold">Your requests</h2>
          <ul className="mt-4 divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{TYPE_LABEL[r.request_type] ?? r.request_type}</span>
                  <Badge tone={r.status === 'resolved' ? 'success' : r.status === 'rejected' ? 'danger' : 'neutral'}>{titleCase(r.status.replace('_', ' '))}</Badge>
                  <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-ink-2">{r.message}</p>
                {r.resolution_note ? <p className="mt-1 text-xs text-muted">Reply: {r.resolution_note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
