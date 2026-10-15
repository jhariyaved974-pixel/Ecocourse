import { NextResponse } from 'next/server';
import { getStaff, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/admin/operations';

// CSV export of variant stock for catalogue staff (RLS + role check apply).
export async function GET() {
  const staff = await getStaff();
  if (!staff || !roleAllowed(staff.role, ROLE_GROUPS.catalog)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createSupabaseServerClient();
  const rows: unknown[][] = [['sku', 'product', 'colour', 'size', 'on_hand', 'reserved', 'available', 'active']];
  for (let offset = 0; offset < 20000; offset += 200) {
    const { data, error } = await supabase.rpc('admin_list_inventory', { p_limit: 200, p_offset: offset });
    if (error) return new NextResponse('Export failed', { status: 500 });
    for (const r of data ?? []) rows.push([r.sku, r.product_name, r.color_name ?? '', r.size_label, r.stock_on_hand, r.stock_reserved, r.available, r.is_active ? 'yes' : 'no']);
    if (!data || data.length < 200) break;
  }
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inventory-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
