'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { usePathname } from 'next/navigation';
import { Globe, X } from 'lucide-react';
import { submitInternationalInterest } from '@/app/(store)/actions';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form-controls';
import { Button } from '@/components/ui/button';
import { BUYER_TYPES, countryName, countryOptions } from '@/lib/international';

export function InternationalInterestForm({ defaultCountry, source }: { defaultCountry?: string | null; source?: string }) {
  const [state, action, pending] = useActionState(submitInternationalInterest, null);
  const countries = React.useMemo(() => countryOptions(), []);
  const id = React.useId();
  if (state?.ok) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6" role="status">
        <p className="font-medium">Request received</p>
        <p className="mt-1 text-sm text-muted">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="path" value={source ?? ''} />
      <div className="absolute -left-[9999px]" aria-hidden>
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor={`${id}-name`} required>
          <Input id={`${id}-name`} name="fullName" required autoComplete="name" maxLength={120} />
        </Field>
        <Field label="Email" htmlFor={`${id}-email`} required>
          <Input id={`${id}-email`} name="email" type="email" required autoComplete="email" maxLength={254} />
        </Field>
        <Field label="Country" htmlFor={`${id}-country`} required>
          <NativeSelect id={`${id}-country`} name="country" required defaultValue={defaultCountry && countryName(defaultCountry) ? defaultCountry : ''}>
            <option value="" disabled>Choose your country</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Phone / WhatsApp" htmlFor={`${id}-phone`} hint="Optional, with country code">
          <Input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={30} />
        </Field>
      </div>
      <Field label="I'm buying" htmlFor={`${id}-buyer`}>
        <NativeSelect id={`${id}-buyer`} name="buyerType" defaultValue="personal">
          {BUYER_TYPES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="What are you interested in?" htmlFor={`${id}-interest`} hint="Products, categories or links">
        <Input id={`${id}-interest`} name="interest" maxLength={300} />
      </Field>
      <Field label="Anything else?" htmlFor={`${id}-message`}>
        <Textarea id={`${id}-message`} name="message" maxLength={2000} rows={3} />
      </Field>
      {state && !state.ok ? <p className="text-sm text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" loading={pending}>Send request</Button>
    </form>
  );
}

const DISMISS_KEY = 'stm_intl_banner_dismissed';
const dismissListeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {}
  dismissListeners.forEach((l) => l());
}

function subscribeDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

/** Thin bar for visitors outside India, pointing them at the interest form. */
export function InternationalBanner({ country }: { country: string }) {
  const pathname = usePathname();
  // Hidden during server render; the stored dismissal is read after hydration.
  const hidden = React.useSyncExternalStore(subscribeDismissed, readDismissed, () => true);
  if (hidden || pathname === '/international') return null;
  const name = countryName(country);
  return (
    <div className="border-b border-line bg-surface-2 text-sm">
      <div className="container-x flex items-center gap-3 py-2">
        <Globe className="size-4 shrink-0 text-muted" aria-hidden />
        <p className="min-w-0 flex-1">
          Shopping from {name || 'outside India'}?{' '}
          <Link href={`/international?country=${country}`} className="font-medium underline underline-offset-4">Tell us — we may ship to you</Link>
        </p>
        <button
          type="button"
          className="rounded-full p-1 text-muted hover:text-ink"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
