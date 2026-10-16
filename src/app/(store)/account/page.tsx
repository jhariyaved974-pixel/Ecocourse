import Link from 'next/link';
import { requireUserPage } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/account/profile-form';
import { Notice } from '@/components/ui/misc';
import { signOut } from '@/app/(store)/(auth)/actions';
import { getStoreSettings } from '@/lib/content/queries';

export default async function AccountPage(props: PageProps<'/account'>) {
  const user = await requireUserPage('/account');
  const sp = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, settings] = await Promise.all([
    supabase.from('profiles').select('full_name, phone, marketing_opt_in, cart_reminder_opt_in').eq('id', user.id).maybeSingle(),
    getStoreSettings(),
  ]);
  return (
    <div className="space-y-10">
      {sp.password === 'updated' ? <Notice tone="success">Your password was updated.</Notice> : null}
      <section>
        <h2 className="text-xl font-semibold">Profile</h2>
        <div className="mt-6">
          <ProfileForm email={user.email ?? ''} fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} marketing={profile?.marketing_opt_in ?? false}
            cartReminders={settings.cart_reminders_enabled ? profile?.cart_reminder_opt_in ?? false : null}
          />
        </div>
      </section>
      <section className="border-t border-line pt-8">
        <h2 className="text-xl font-semibold">Security</h2>
        <p className="mt-2 text-sm text-muted">
          To change your password, <Link href="/forgot-password" className="underline underline-offset-4">request a reset link</Link>. We will never ask for your
          password, OTP or UPI PIN by phone or email.
        </p>
        <form action={signOut} className="mt-4 lg:hidden">
          <button type="submit" className="text-sm underline underline-offset-4">Sign out</button>
        </form>
      </section>
    </div>
  );
}
