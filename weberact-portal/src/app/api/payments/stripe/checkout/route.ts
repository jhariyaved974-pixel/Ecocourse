import type { NextRequest } from 'next/server';
import { apiViewer, isUuid, json } from '@/lib/api';
import { createStripeCheckout, paymentConfig } from '@/lib/payments';
import type { Invoice } from '@/lib/types';

export async function POST(req: NextRequest) {
  if (!paymentConfig().stripe) return json({ error: 'Online card payment is not set up yet.' }, 503);
  const v = await apiViewer();
  if (!v) return json({ error: 'Not signed in' }, 401);
  const { invoiceId } = await req.json().catch(() => ({}));
  if (!isUuid(String(invoiceId))) return json({ error: 'Invalid invoice' }, 400);
  const { data: inv } = await v.supabase.from('invoice_summaries').select('*').eq('id', invoiceId).maybeSingle<Invoice>();
  if (!inv || inv.status !== 'issued' || Number(inv.balance) <= 0) return json({ error: 'This invoice has nothing to pay.' }, 400);
  try {
    const s = await createStripeCheckout({ id: inv.id, number: inv.number!, balance: Number(inv.balance), currency: inv.currency, email: v.email });
    return json({ url: s.url });
  } catch (e) { return json({ error: (e as Error).message }, 502); }
}
