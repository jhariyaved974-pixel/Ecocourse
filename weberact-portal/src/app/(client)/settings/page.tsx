import type { Metadata } from 'next';
import { requireClient } from '@/lib/auth';
import { Card, CardHeader, KeyValue, PageHeader } from '@/components/ui/primitives';
import { PasswordCard, ProfileForm } from '@/components/portal/settings-forms';

export const metadata: Metadata = { title: 'Settings' };
export default async function Settings() {
  const v = await requireClient();
  const o = v.organization;
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Your profile" /><div className="px-6 pb-6"><ProfileForm initial={{ full_name: v.profile.full_name ?? '', phone: v.profile.phone ?? '', email: v.email, email_notifications: v.profile.email_notifications }} /></div></Card>
        <Card><CardHeader title="Password" description="Set or change the password you sign in with." /><div className="px-6 pb-6"><PasswordCard /></div></Card>
        <Card><CardHeader title="Company" description="To update these details, message your project manager." />
          <div className="px-6 pb-4"><KeyValue items={[['Company', o.name], ['Legal name', o.legal_name], ['Website', o.website], ['Country', o.country], ['Tax ID', o.tax_id], ['Billing address', o.billing_address], ['Billing currency', o.currency]]} /></div></Card>
        <Card><CardHeader title="Sign out" description="Ends your session on this device." /><div className="px-6 pb-6"><form action="/auth/signout" method="post"><button className="rounded-xl border border-line-strong px-4 py-2.5 text-sm text-fg-muted transition hover:bg-white/5 hover:text-fg">Sign out</button></form></div></Card>
      </div>
    </>
  );
}
