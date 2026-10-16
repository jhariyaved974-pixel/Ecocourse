import { NextResponse } from 'next/server';
import { getStaff, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/admin/orders';

/**
 * Personal-data export for a customer's data-export or deletion request
 * (owners/admins only). Contains what the store holds about the person; no
 * authentication secrets, payment-proof files or internal staff notes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaff();
  if (!staff || !roleAllowed(staff.role, ROLE_GROUPS.admin)) return new NextResponse('Forbidden', { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: request } = await supabase.from('customer_requests').select('user_id, email').eq('id', id).maybeSingle();
  if (!request?.user_id) return new NextResponse('Not found', { status: 404 });
  const uid = request.user_id;
  const [profile, addresses, orders, reviews, requests, wishlist, subscriptions] = await Promise.all([
    supabase.from('profiles').select('email, full_name, phone, marketing_opt_in, marketing_opt_in_at, created_at').eq('id', uid).maybeSingle(),
    supabase.from('addresses').select('label, full_name, phone, line1, line2, landmark, city, state, postal_code, country, is_default, created_at').eq('user_id', uid),
    supabase
      .from('orders')
      .select('order_number, created_at, email, phone, customer_name, ship_line1, ship_line2, ship_landmark, ship_city, ship_state, ship_postal_code, subtotal, discount_total, shipping_total, tax_total, total, coupon_code, payment_method, payment_status, order_status, paid_at, tracking_carrier, tracking_number, order_items(product_name, color_name, variant_label, size_label, quantity, unit_price, line_total)')
      .eq('user_id', uid),
    supabase.from('reviews').select('rating, title, body, status, created_at, product:products(name)').eq('user_id', uid),
    supabase.from('customer_requests').select('request_type, message, status, resolution_note, created_at').eq('user_id', uid),
    supabase.from('wishlist_items').select('created_at, product:products(name)').eq('user_id', uid),
    supabase.from('newsletter_subscribers').select('email, status, source, consent_text, created_at, unsubscribed_at').ilike('email', request.email.replace(/[\\%_]/g, '\\$&')), // exact, case-insensitive
  ]);
  const body = {
    generated_at: new Date().toISOString(),
    note: 'Amounts are in paise (1/100 of a rupee).',
    profile: profile.data,
    addresses: addresses.data ?? [],
    orders: orders.data ?? [],
    reviews: reviews.data ?? [],
    requests: requests.data ?? [],
    wishlist: wishlist.data ?? [],
    newsletter: subscriptions.data ?? [],
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="customer-data-${id.slice(0, 8)}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
