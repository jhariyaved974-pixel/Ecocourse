import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Panel, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { DeleteTaxRule, ShippingMethodDialog, TaxRuleDialog, TaxSettingsForm } from '@/components/admin/settings/shipping-tax';
import { Badge, Notice } from '@/components/ui/misc';
import { formatMoney, paiseToRupeeString } from '@/lib/utils';

export const metadata: Metadata = { title: 'Shipping & tax' };

export default async function ShippingTaxPage() {
  await requireStaffPage(ROLE_GROUPS.admin);
  const supabase = await createSupabaseServerClient();
  const [methods, tax, rules] = await Promise.all([
    supabase.from('shipping_methods').select('*').order('sort_order'),
    supabase.from('tax_settings').select('*').maybeSingle(),
    supabase.from('tax_rules').select('*').order('priority', { ascending: false }).order('min_unit_price'),
  ]);
  return (
    <>
      <PageHeader title="Shipping & tax" description="Fees, free-delivery thresholds and GST are applied by the server when every order is priced." />
      <div className="space-y-6">
        <Panel title="Delivery methods" actions={<ShippingMethodDialog method={null} />}>
          <TableWrap className="border-0">
            <Table>
              <thead><tr><Th>Method</Th><Th className="text-right">Fee</Th><Th className="text-right">Free over</Th><Th>Delivery</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {(methods.data ?? []).map((m) => (
                  <tr key={m.id}>
                    <Td><span className="font-medium">{m.name}</span> <span className="font-mono text-xs text-muted">{m.code}</span><span className="block text-xs text-muted">{m.description}</span></Td>
                    <Td className="text-right tabular-nums">{m.fee ? formatMoney(m.fee) : 'Free'}</Td>
                    <Td className="text-right tabular-nums">{m.free_over !== null ? formatMoney(m.free_over) : '—'}</Td>
                    <Td className="text-muted">{m.min_days}–{m.max_days} days</Td>
                    <Td>{m.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Off</Badge>}</Td>
                    <Td className="text-right">
                      <ShippingMethodDialog
                        method={{ id: m.id, code: m.code, name: m.name, description: m.description, fee: paiseToRupeeString(m.fee), freeOver: m.free_over !== null ? paiseToRupeeString(m.free_over) : '', minDays: String(m.min_days), maxDays: String(m.max_days), isActive: m.is_active, sortOrder: String(m.sort_order) }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
        <Panel title="Tax">
          <Notice tone="info" className="mb-5">GST rates depend on the type of product (and for some products on the price per unit) and change from time to time. The rate bands below apply to every product, so the starting 18% band is a placeholder: confirm the rates for what you sell with your tax adviser before going live.</Notice>
          {tax.data ? (
            <TaxSettingsForm initial={{ enabled: tax.data.enabled, pricesIncludeTax: tax.data.prices_include_tax, taxLabel: tax.data.tax_label, businessTaxId: tax.data.business_tax_id ?? '' }} />
          ) : null}
          <div className="mt-8 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Rate bands (by price per unit)</h3>
            <TaxRuleDialog rule={null} />
          </div>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {(rules.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{r.name}</span> · {(r.rate_bps / 100).toFixed(2).replace(/\.00$/, '')}%
                  <span className="block text-xs text-muted">
                    {formatMoney(r.min_unit_price)} {r.max_unit_price !== null ? `to ${formatMoney(r.max_unit_price)}` : 'and above'} · priority {r.priority}
                    {!r.is_active ? ' · inactive' : ''}
                  </span>
                </span>
                <span className="flex gap-1">
                  <TaxRuleDialog rule={{ id: r.id, name: r.name, ratePercent: String(r.rate_bps / 100), minUnitPrice: paiseToRupeeString(r.min_unit_price), maxUnitPrice: r.max_unit_price !== null ? paiseToRupeeString(r.max_unit_price) : '', priority: String(r.priority), isActive: r.is_active }} />
                  <DeleteTaxRule id={r.id} name={r.name} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
