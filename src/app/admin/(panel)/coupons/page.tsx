import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { CouponEditor, type CouponRow } from '@/components/admin/coupons/coupon-editor';
import { CouponRowActions } from '@/components/admin/coupons/coupon-row-actions';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { formatDate, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Coupons' };

export default async function CouponsPage() {
  await requireStaffPage(ROLE_GROUPS.admin);
  const supabase = await createSupabaseServerClient();
  const [coupons, redemptions, products, categories, scopeProducts, scopeCategories] = await Promise.all([
    supabase.from('coupons').select('*').order('created_at', { ascending: false }),
    supabase.from('coupon_redemptions').select('coupon_id, status, discount_amount'),
    supabase.from('products').select('id, name').neq('status', 'archived').order('name'),
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('coupon_products').select('coupon_id, product_id'),
    supabase.from('coupon_categories').select('coupon_id, category_id'),
  ]);
  const usage = new Map<string, { used: number; reserved: number; discount: number }>();
  for (const r of redemptions.data ?? []) {
    const u = usage.get(r.coupon_id) ?? { used: 0, reserved: 0, discount: 0 };
    if (r.status === 'redeemed') {
      u.used += 1;
      u.discount += r.discount_amount;
    } else if (r.status === 'reserved') u.reserved += 1;
    usage.set(r.coupon_id, u);
  }
  const rows: CouponRow[] = (coupons.data ?? []).map((c) => ({
    ...c,
    productIds: (scopeProducts.data ?? []).filter((s) => s.coupon_id === c.id).map((s) => s.product_id),
    categoryIds: (scopeCategories.data ?? []).filter((s) => s.coupon_id === c.id).map((s) => s.category_id),
  }));
  const productOptions = products.data ?? [];
  const categoryOptions = categories.data ?? [];
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discounts are always validated and calculated on the server at checkout."
        actions={<CouponEditor coupon={null} products={productOptions} categories={categoryOptions} />}
      />
      {coupons.error ? <Notice tone="danger">Coupons could not be loaded.</Notice> : null}
      {rows.length === 0 ? (
        <EmptyState title="No coupons yet" description="Create a code for a promotion or a first-order discount." />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Conditions</Th>
                <Th>Window</Th>
                <Th className="text-right">Used</Th>
                <Th>Status</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const u = usage.get(c.id) ?? { used: 0, reserved: 0, discount: 0 };
                const expired = c.ends_at !== null && c.ends_at < now;
                const scheduled = c.starts_at !== null && c.starts_at > now;
                return (
                  <tr key={c.id}>
                    <Td>
                      <span className="font-mono font-semibold">{c.code}</span>
                      {c.description ? <span className="block max-w-56 truncate text-xs text-muted">{c.description}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {c.discount_type === 'percentage' ? `${c.value}% off` : `${formatMoney(c.value)} off`}
                      {c.max_discount ? <span className="block text-xs text-muted">up to {formatMoney(c.max_discount)}</span> : null}
                    </Td>
                    <Td className="text-xs text-muted">
                      {[
                        c.min_subtotal ? `Min ${formatMoney(c.min_subtotal)}` : null,
                        c.scope !== 'all' ? (c.scope === 'products' ? `${c.productIds.length} product(s)` : `${c.categoryIds.length} category(ies)`) : null,
                        c.first_order_only ? 'First order' : null,
                        c.usage_limit ? `${c.usage_limit} total` : null,
                        c.per_customer_limit ? `${c.per_customer_limit}/customer` : null,
                      ].filter(Boolean).join(' · ') || 'None'}
                    </Td>
                    <Td className="text-xs text-muted whitespace-nowrap">{c.starts_at || c.ends_at ? `${c.starts_at ? formatDate(c.starts_at) : 'Now'} – ${c.ends_at ? formatDate(c.ends_at) : 'no end'}` : 'Always'}</Td>
                    <Td className="text-right tabular-nums">
                      {u.used}
                      {u.reserved ? <span className="block text-xs text-muted">+{u.reserved} pending</span> : null}
                      {u.discount ? <span className="block text-xs text-muted">{formatMoney(u.discount)} given</span> : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {!c.is_active ? <Badge tone="neutral">Inactive</Badge> : expired ? <Badge tone="neutral">Expired</Badge> : scheduled ? <Badge tone="info">Scheduled</Badge> : <Badge tone="success">Active</Badge>}
                        {c.is_public ? <Badge tone="info">Public</Badge> : null}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <CouponEditor coupon={c} products={productOptions} categories={categoryOptions} />
                        <CouponRowActions id={c.id} code={c.code} active={c.is_active} used={u.used + u.reserved} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
