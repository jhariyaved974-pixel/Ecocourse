'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAddress, saveAddress } from '@/app/(store)/account/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, NativeSelect } from '@/components/ui/form-controls';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';
import { INDIAN_STATES } from '@/lib/india';

export interface Address {
  id: string;
  label: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
}

function AddressForm({ address, onDone }: { address: Address | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const res = await saveAddress(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? 'Saved');
      onDone();
    }
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {address ? <input type="hidden" name="id" value={address.id} /> : null}
      {state && !state.ok ? <Notice tone="danger" className="sm:col-span-2">{state.error}</Notice> : null}
      <Field label="Label" htmlFor="label">
        <NativeSelect id="label" name="label" defaultValue={address?.label ?? 'Home'}>
          <option>Home</option>
          <option>Work</option>
          <option>Other</option>
        </NativeSelect>
      </Field>
      <Field label="Full name" htmlFor="a-fullName" error={fe.fullName} required>
        <Input id="a-fullName" name="fullName" defaultValue={address?.full_name} maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Mobile number" htmlFor="a-phone" error={fe.phone} required>
        <Input id="a-phone" name="phone" type="tel" defaultValue={address?.phone} maxLength={16} autoComplete="tel-national" />
      </Field>
      <Field label="PIN code" htmlFor="a-postal" error={fe.postalCode} required>
        <Input id="a-postal" name="postalCode" inputMode="numeric" defaultValue={address?.postal_code} maxLength={6} autoComplete="postal-code" />
      </Field>
      <Field label="House / flat, street" htmlFor="a-line1" error={fe.line1} required className="sm:col-span-2">
        <Input id="a-line1" name="line1" defaultValue={address?.line1} maxLength={200} autoComplete="address-line1" />
      </Field>
      <Field label="Area, locality" htmlFor="a-line2" error={fe.line2}>
        <Input id="a-line2" name="line2" defaultValue={address?.line2 ?? ''} maxLength={200} autoComplete="address-line2" />
      </Field>
      <Field label="Landmark" htmlFor="a-landmark" error={fe.landmark}>
        <Input id="a-landmark" name="landmark" defaultValue={address?.landmark ?? ''} maxLength={120} />
      </Field>
      <Field label="City" htmlFor="a-city" error={fe.city} required>
        <Input id="a-city" name="city" defaultValue={address?.city} maxLength={80} autoComplete="address-level2" />
      </Field>
      <Field label="State" htmlFor="a-state" error={fe.state} required>
        <NativeSelect id="a-state" name="state" defaultValue={address?.state ?? ''} autoComplete="address-level1">
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </NativeSelect>
      </Field>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="isDefault" defaultChecked={address?.is_default} className="size-4 accent-[var(--ink)]" />
        Use as my default delivery address
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>Save address</Button>
      </div>
    </form>
  );
}

export function AddressBook({ addresses }: { addresses: Address[] }) {
  const [editing, setEditing] = React.useState<Address | 'new' | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Saved addresses</h2>
        {addresses.length < 10 ? (
          <Button variant="outline" onClick={() => setEditing('new')}>
            <Plus /> Add address
          </Button>
        ) : null}
      </div>
      {addresses.length === 0 ? (
        <EmptyState icon={<MapPin className="size-6" />} title="No saved addresses" description="Save an address for faster checkout." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-[var(--radius)] border border-line bg-surface p-5 text-sm">
              <div className="flex items-center gap-2">
                <p className="font-medium">{a.label}</p>
                {a.is_default ? <Badge tone="neutral">Default</Badge> : null}
              </div>
              <p className="mt-2 text-ink-2">
                {a.full_name}
                <br />
                {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
                <br />
                {a.city}, {a.state} {a.postal_code}
                <br />
                {a.phone}
              </p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm('Remove this address?')) return;
                    startTransition(async () => {
                      const res = await deleteAddress(a.id);
                      if (res.ok) toast.success(res.message ?? 'Removed');
                      else toast.error(res.error);
                    });
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add address' : 'Edit address'}</DialogTitle>
          </DialogHeader>
          {editing !== null ? <AddressForm key={editing === 'new' ? 'new' : editing.id} address={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
