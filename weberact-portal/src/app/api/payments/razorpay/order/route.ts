import type { NextRequest } from 'next/server';
import { apiViewer, isUuid, json } from '@/lib/api';
import { createRazorpayOrder, paymentConfig, razorpayKeyId } from '@/lib/payments';
import type { Invoice } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!paymentConfig().razorpay) return json({ error: 'Online payment by Razorpay is not set up yet.' }, 503);
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  const { invoiceId } = await req.json().catch(() => ({}));
  if (!isUuid(String(invoiceId))) return json({ error: 'Invalid invoice' }, 400);
  // read as the signed-in person: only their own issued invoices are visible
  const { data: inv } = await v.supabase.from('invoice_summaries').select('*').eq('id', invoiceId).maybeSingle<Invoice>();
  if (!inv || inv.status !== 'issued' || Number(inv.balance) <= 0) return json({ error: 'This invoice has nothing to pay.' }, 400);
  try {
    const order = await createRazorpayOrder({ id: inv.id, number: inv.number!, balance: Number(inv.balance), currency: inv.currency });
    return json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: razorpayKeyId(), number: inv.number, email: v.email, name: v.profile.full_name ?? '' });
  } catch (e) { return json({ error: (e as Error).message }, 502); }
}
