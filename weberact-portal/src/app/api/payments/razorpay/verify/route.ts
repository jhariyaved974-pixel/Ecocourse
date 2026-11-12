import type { NextRequest } from 'next/server';
import { apiViewer, isUuid, json } from '@/lib/api';
import { fetchRazorpayPayment, paymentConfig, recordGatewayPayment, verifyRazorpayPayment } from '@/lib/payments';

export async function POST(req: NextRequest) {
  if (!paymentConfig().razorpay) return json({ error: 'Not configured' }, 503);
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  const b = await req.json().catch(() => ({}));
  const { invoiceId, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = b ?? {};
  if (!isUuid(String(invoiceId)) || !orderId || !paymentId || !signature) return json({ error: 'Incomplete payment details' }, 400);
  if (!verifyRazorpayPayment(String(orderId), String(paymentId), String(signature))) return json({ error: 'Payment signature did not verify' }, 400);
  const { data: inv } = await v.supabase.from('invoices').select('id').eq('id', invoiceId).maybeSingle();
  if (!inv) return json({ error: 'Invoice not found' }, 404);
  try {
    const p = await fetchRazorpayPayment(String(paymentId));
    if (p.order_id !== orderId || !['captured', 'authorized'].includes(p.status) || p.notes?.invoice_id !== invoiceId) return json({ error: 'Payment does not match this invoice' }, 400);
    await recordGatewayPayment({ invoiceId, amountMinor: p.amount, currency: p.currency, provider: 'razorpay', providerId: p.id, reference: p.id });
    return json({ ok: true });
  } catch (e) { return json({ error: (e as Error).message }, 502); }
}
