import type { Metadata } from 'next';
import { requireUserPage } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AddressBook } from '@/components/account/address-book';

export const metadata: Metadata = { title: 'Addresses' };

export default async function AddressesPage() {
  await requireUserPage('/account/addresses');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('addresses')
    .select('id, label, full_name, phone, line1, line2, landmark, city, state, postal_code, is_default')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  return <AddressBook addresses={data ?? []} />;
}
