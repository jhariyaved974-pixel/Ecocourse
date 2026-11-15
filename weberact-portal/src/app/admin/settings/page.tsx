import type { Metadata } from 'next';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { serviceConfigured } from '@/lib/supabase/admin';
import { paymentConfig } from '@/lib/payments';
import { googleConfigured, serviceAccountEmail } from '@/lib/google';
import { emailConfigured } from '@/lib/email';
import type { PortalSettings } from '@/lib/types';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { SettingsForm } from '@/components/admin/settings-form';
import { PasswordCard, ProfileForm } from '@/components/portal/settings-forms';

export const metadata: Metadata = { title: 'Settings' };
export default async function AdminSettings() {
  const v = await requireStaff();
  const { data } = await v.supabase.from('portal_settings').select('*').eq('id', 1).single();
  const pay = paymentConfig();
  const rows: [string, boolean, string][] = [
    ['Supabase secret key', serviceConfigured, 'Invites, online payments and scheduled jobs. Set SUPABASE_SECRET_KEY on the server.'],
    ['Email notifications (Resend)', emailConfigured(), 'Set RESEND_API_KEY and EMAIL_FROM. In-app notifications work without it.'],
    ['Razorpay (INR)', pay.razorpay, 'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET; webhook: RAZORPAY_WEBHOOK_SECRET'],
    ['Stripe (international)', pay.stripe, 'STRIPE_SECRET_KEY; webhook: STRIPE_WEBHOOK_SECRET'],
    ['Google Search Console & Analytics', googleConfigured(), googleConfigured() ? `Add ${serviceAccountEmail()} as a user on each client property.` : 'GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'],
    ['PageSpeed Insights', true, process.env.PAGESPEED_API_KEY ? 'Using your API key' : 'Works without a key at low volume; PAGESPEED_API_KEY raises the limit'],
    ['Scheduled jobs', Boolean(process.env.CRON_SECRET), 'Set CRON_SECRET; Vercel Cron calls /api/cron/daily once a day'],
  ];
  return (
    <>
      <PageHeader eyebrow="Studio" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card><CardHeader title="Agency and invoicing" description="Printed on every invoice and contract PDF." /><div className="px-6 pb-6"><SettingsForm s={data as PortalSettings} canEdit={v.isAdmin} /></div></Card>
        <div className="space-y-6">
          <Card><CardHeader title="Integrations" description="Each works once its environment variables are set on the server. Secrets are never sent to the browser." />
            <ul className="divide-y divide-line">{rows.map(([name, on, hint]) => (
              <li key={name} className="flex gap-3 px-6 py-3.5">{on ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />}<div><p className="text-[13.5px] font-medium">{name}</p><p className="text-[12px] text-fg-faint">{hint}</p></div></li>
            ))}</ul>
          </Card>
          <Card><CardHeader title="Your profile" /><div className="px-6 pb-6"><ProfileForm initial={{ full_name: v.profile.full_name ?? '', phone: v.profile.phone ?? '', email: v.email, email_notifications: v.profile.email_notifications }} /></div></Card>
          <Card><CardHeader title="Password" /><div className="px-6 pb-6"><PasswordCard /></div></Card>
        </div>
      </div>
    </>
  );
}
