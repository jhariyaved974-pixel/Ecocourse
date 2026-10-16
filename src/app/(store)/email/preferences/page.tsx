import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { parseOptOut } from '@/lib/email/optout';
import { OptOutForm } from '@/components/store/opt-out-form';
import { Notice } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false, follow: false } };

async function Preferences({ searchParams }: { searchParams: PageProps<'/email/preferences'>['searchParams'] }) {
  const optOut = parseOptOut(await searchParams);
  if (!optOut) {
    return (
      <Notice tone="warning">
        This link is invalid or incomplete. <Link href="/account" className="underline underline-offset-4">Sign in</Link> to manage your email preferences.
      </Notice>
    );
  }
  const fields: Record<string, string> =
    optOut.kind === 'cart' ? { kind: 'cart', u: optOut.userId, t: optOut.token } : { kind: 'newsletter', e: optOut.email, t: optOut.token };
  return (
    <div className="space-y-4">
      <p className="text-muted">
        {optOut.kind === 'cart'
          ? 'Stop emails that remind you about items left in your cart? Order and payment emails are not affected.'
          : `Unsubscribe ${optOut.email} from our newsletter? Order and payment emails are not affected.`}
      </p>
      <OptOutForm fields={fields} label={optOut.kind === 'cart' ? 'Stop cart reminders' : 'Unsubscribe'} />
    </div>
  );
}

export default function EmailPreferencesPage(props: PageProps<'/email/preferences'>) {
  return (
    <div className="container-x max-w-xl py-16">
      <h1 className="font-display text-4xl">Email preferences</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Preferences searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
