'use client';

import * as React from 'react';
import Link from 'next/link';
import { KeyRound, UserPlus } from 'lucide-react';
import { addStaffMember, removeStaffMember, saveSecuritySettings, updateStaffMember } from '@/app/admin/(panel)/settings/staff/actions';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Switch } from '@/components/ui/form-controls';
import { Badge, Notice } from '@/components/ui/misc';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { StaffRole } from '@/lib/auth';
import { formatDate, titleCase } from '@/lib/utils';

export interface StaffRow {
  userId: string;
  email: string;
  name: string | null;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

const ROLE_HELP: Record<StaffRole, string> = {
  owner: 'Everything, including owners and security',
  admin: 'Everything except managing owners/admins',
  editor: 'Products, inventory, media and content',
  support: 'Orders, customers, reviews and requests',
};

export function AddStaffForm({ canGrantAdmin }: { canGrantAdmin: boolean }) {
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<StaffRole>('support');
  const { run, pending } = useActionRunner();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(() => addStaffMember({ email, role }));
        if (res.ok) setEmail('');
      }}
    >
      <Field label="Email of an existing account" htmlFor="staff-email" hint="They must sign up on the store first. You never set their password.">
        <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
      </Field>
      <Field label="Role" htmlFor="staff-role">
        <NativeSelect id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {(canGrantAdmin ? (['support', 'editor', 'admin', 'owner'] as const) : (['support', 'editor'] as const)).map((r) => (
            <option key={r} value={r}>{titleCase(r)} — {ROLE_HELP[r]}</option>
          ))}
        </NativeSelect>
      </Field>
      <Button type="submit" loading={pending}><UserPlus /> Add</Button>
    </form>
  );
}

export function StaffRowControls({ row, me, canManage }: { row: StaffRow; me: string; canManage: boolean }) {
  const [role, setRole] = React.useState<StaffRole>(row.role);
  const { run, pending } = useActionRunner();
  if (!canManage || row.userId === me) return <span className="text-xs text-muted">{row.userId === me ? 'You' : 'Owner-managed'}</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <NativeSelect aria-label={`Role for ${row.email}`} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="h-9 w-32 text-xs">
        {(['support', 'editor', 'admin', 'owner'] as const).map((r) => (
          <option key={r} value={r}>{titleCase(r)}</option>
        ))}
      </NativeSelect>
      {role !== row.role ? (
        <Button size="sm" loading={pending} onClick={() => run(() => updateStaffMember({ userId: row.userId, role, active: row.active }))}>Save role</Button>
      ) : null}
      <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => updateStaffMember({ userId: row.userId, role: row.role, active: !row.active }))}>
        {row.active ? 'Deactivate' : 'Reactivate'}
      </Button>
      <ConfirmActionButton title={`Remove ${row.email} from staff?`} description="They lose admin access immediately. Their customer account and orders are not affected." confirmLabel="Remove access" danger variant="ghost" action={() => removeStaffMember(row.userId)} success="Staff access removed">
        Remove
      </ConfirmActionButton>
    </div>
  );
}

export function SecuritySettingsForm({ initial, isOwner }: { initial: { requireMfa: boolean; sessionHours: number }; isOwner: boolean }) {
  const [v, setV] = React.useState(initial);
  const { run, pending } = useActionRunner();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSecuritySettings(v));
      }}
    >
      {!isOwner ? <Notice tone="neutral">Only owners can change these settings.</Notice> : null}
      <label className="flex items-start gap-3 text-sm">
        <Switch checked={v.requireMfa} disabled={!isOwner} onCheckedChange={(c) => setV((s) => ({ ...s, requireMfa: c }))} aria-label="Require two-factor authentication for staff" className="mt-0.5" />
        <span>
          Require two-factor authentication (authenticator app) for all staff
          <span className="block text-xs text-muted">Staff without it are sent to set it up at their next sign-in; the database ignores staff sessions without a second factor.</span>
        </span>
      </label>
      <Field label="Staff sessions expire after (hours)" htmlFor="sec-hours" hint="Staff must sign in again after this, even if active." className="max-w-xs">
        <Input id="sec-hours" inputMode="numeric" disabled={!isOwner} value={String(v.sessionHours)} onChange={(e) => setV((s) => ({ ...s, sessionHours: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 }))} />
      </Field>
      {isOwner ? <Button type="submit" loading={pending}>Save security settings</Button> : null}
    </form>
  );
}

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

/** The signed-in staff member's own authenticator apps (Supabase Auth MFA). */
export function MyTwoFactor() {
  const [factors, setFactors] = React.useState<Factor[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const { data, error: e } = await getSupabaseBrowserClient().auth.mfa.listFactors();
    if (e) setError('Could not load your two-factor settings.');
    else setFactors((data?.totp ?? []) as Factor[]);
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    getSupabaseBrowserClient().auth.mfa.listFactors().then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError('Could not load your two-factor settings.');
      else setFactors((data?.totp ?? []) as Factor[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const verified = factors?.filter((f) => f.status === 'verified') ?? [];
  return (
    <div className="space-y-3 text-sm">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {factors === null && !error ? <div className="skeleton h-10 w-full" /> : null}
      {factors && verified.length === 0 ? (
        <Notice tone="warning" title="Two-factor authentication is off for your account">
          Protect the admin with an authenticator app. <Link href="/admin/mfa" className="font-medium underline">Set it up</Link>
        </Notice>
      ) : null}
      {verified.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
          <span className="flex items-center gap-2"><KeyRound className="size-4" /> {f.friendly_name || 'Authenticator app'} <Badge tone="success">Active</Badge> <span className="text-xs text-muted">since {formatDate(f.created_at)}</span></span>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={async () => {
              if (!window.confirm('Remove this authenticator? If two-factor is required, you will have to set up a new one at your next sign-in.')) return;
              setBusy(true);
              const { error: e } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: f.id });
              setBusy(false);
              if (e) setError('Removing requires a recent two-factor sign-in. Sign out and back in, then try again.');
              else await load();
            }}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
