'use client';

import * as React from 'react';
import { CalendarClock, Link2, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { deleteAnnouncement, reorderAnnouncements, saveAnnouncement, setAnnouncementActive } from '@/app/admin/(panel)/content/announcements/actions';
import {
  ANNOUNCEMENT_LIMITS,
  HREF_HINT,
  announcementStatus,
  isSafeHref,
  isoToIstInput,
  previewTokens,
  unknownTokens,
  type AnnouncementStatus,
  type TokenValues,
} from '@/lib/admin/content';
import { cn, formatDateTime } from '@/lib/utils';
import { DragHandle, SortableList, orderBy, useLocalOrder } from './sortable';
import { TokenHelp } from './token-help';

export interface AnnouncementRow {
  id: string;
  message: string;
  href: string | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

const STATUS: Record<AnnouncementStatus, { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }> = {
  live: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  expired: { label: 'Ended', tone: 'warning' },
  inactive: { label: 'Off', tone: 'neutral' },
};

interface Draft {
  id: string | null;
  message: string;
  href: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

function windowText(a: { startsAt: string | null; endsAt: string | null }) {
  if (a.startsAt && a.endsAt) return `${formatDateTime(a.startsAt)} → ${formatDateTime(a.endsAt)}`;
  if (a.startsAt) return `From ${formatDateTime(a.startsAt)}`;
  if (a.endsAt) return `Until ${formatDateTime(a.endsAt)}`;
  return 'Always';
}

export function AnnouncementManager({ announcements, tokens, now }: { announcements: AnnouncementRow[]; tokens: TokenValues; now: number }) {
  const { run } = useActionRunner();
  const [ids, setIds, resetIds] = useLocalOrder(announcements.map((a) => a.id));
  const ordered = orderBy(announcements, ids);
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const [active, setActive] = React.useState<Record<string, { base: string; value: boolean }>>({});
  const activeOf = (a: AnnouncementRow) => (active[a.id]?.base === a.updatedAt ? active[a.id].value : a.isActive);

  const saveOrder = async (next: string[]) => {
    setIds(next);
    const res = await run(() => reorderAnnouncements(next), { success: 'Order saved' });
    if (!res.ok) resetIds();
  };
  const toggle = async (a: AnnouncementRow, value: boolean) => {
    setActive((s) => ({ ...s, [a.id]: { base: a.updatedAt, value } }));
    const res = await run(() => setAnnouncementActive({ id: a.id, active: value }));
    if (!res.ok) setActive((s) => ({ ...s, [a.id]: { base: '', value } }));
  };
  const liveCount = ordered.filter((a) => announcementStatus({ is_active: activeOf(a), starts_at: a.startsAt, ends_at: a.endsAt }, now) === 'live').length;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel
        title={`Announcement bar (${liveCount} live)`}
        description="Messages rotate in the bar above the site header, in this order. Drag to reorder."
        actions={
          <Button size="sm" onClick={() => setEditing({ id: null, message: '', href: '', isActive: true, startsAt: '', endsAt: '' })}>
            <Plus /> New announcement
          </Button>
        }
      >
        {ordered.length ? (
          <SortableList
            label="Announcements"
            items={ordered}
            itemLabel={(a) => a.message}
            onReorder={saveOrder}
            className="space-y-2"
            renderItem={(a, handle) => {
              const on = activeOf(a);
              const status = announcementStatus({ is_active: on, starts_at: a.startsAt, ends_at: a.endsAt }, now);
              return (
                <div className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-surface py-2 pr-2 pl-1 sm:flex-nowrap">
                  <DragHandle handle={handle} label={`Reorder “${a.message}”`} className="mt-0.5" />
                  <div className={cn('min-w-0 flex-1 basis-[calc(100%-2.5rem)] space-y-1 sm:basis-0', status !== 'live' && 'opacity-70')}>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="break-words">{previewTokens(a.message, tokens)}</span>
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                    </p>
                    {a.message !== previewTokens(a.message, tokens) ? <p className="font-mono text-[11px] break-words text-muted">{a.message}</p> : null}
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="size-3.5" aria-hidden /> {a.href ?? 'No link'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden /> {windowText(a)}
                      </span>
                    </p>
                  </div>
                  <div className="ml-10 flex shrink-0 items-center gap-1 sm:ml-0">
                    <Switch checked={on} onCheckedChange={(v) => toggle(a, v)} aria-label={`Turn “${a.message}” ${on ? 'off' : 'on'}`} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit “${a.message}”`}
                      onClick={() => setEditing({ id: a.id, message: a.message, href: a.href ?? '', isActive: a.isActive, startsAt: isoToIstInput(a.startsAt), endsAt: isoToIstInput(a.endsAt) })}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmActionButton
                      title="Delete this announcement?"
                      description={`“${a.message}” is removed. Turn it off instead to keep it for later.`}
                      confirmLabel="Delete"
                      danger
                      variant="ghost"
                      size="icon-sm"
                      action={() => deleteAnnouncement(a.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">Delete “{a.message}”</span>
                    </ConfirmActionButton>
                  </div>
                </div>
              );
            }}
          />
        ) : (
          <EmptyState icon={<Megaphone className="size-5" />} title="No announcements" description="Add a short message such as a delivery offer or a sale." />
        )}
      </Panel>
      <div className="space-y-4">
        <TokenHelp values={tokens} />
        <p className="px-1 text-xs text-muted">Times are in India Standard Time. Scheduled messages can take up to 10 minutes to appear or disappear.</p>
      </div>
      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent className="max-w-xl">
          {editing ? <AnnouncementForm key={editing.id ?? 'new'} initial={editing} tokens={tokens} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnnouncementForm({ initial, tokens, onDone }: { initial: Draft; tokens: TokenValues; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };
  const unknown = unknownTokens(form.message);
  const hrefInvalid = form.href.trim() !== '' && !isSafeHref(form.href.trim());

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(() => saveAnnouncement(form), { onSuccess: onDone });
        setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial.id ? 'Edit announcement' : 'New announcement'}</DialogTitle>
        <DialogDescription>Plain text, one short line. Placeholders such as {'{free_shipping_over}'} are filled in automatically.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Field
          label="Message"
          htmlFor="ann-message"
          required
          error={errors.message ?? (unknown.length ? `Unknown placeholder ${unknown.join(', ')}.` : undefined)}
          hint={`${form.message.length}/${ANNOUNCEMENT_LIMITS.message}`}
        >
          <Textarea id="ann-message" rows={2} value={form.message} maxLength={ANNOUNCEMENT_LIMITS.message} placeholder="Free delivery on orders over {free_shipping_over}" onChange={(e) => set('message', e.target.value)} aria-invalid={errors.message ? true : undefined} />
        </Field>
        {form.message.trim() ? (
          <div data-surface="dark" className="rounded-lg px-4 py-2.5 text-center text-xs tracking-wide" aria-label="Preview">
            {previewTokens(form.message, tokens)}
          </div>
        ) : null}
        <Field label="Link (optional)" htmlFor="ann-href" error={errors.href ?? (hrefInvalid ? 'Use an on-site path starting with / or a full https:// address.' : undefined)} hint={HREF_HINT}>
          <Input id="ann-href" value={form.href} maxLength={500} placeholder="/shop?sale=1" onChange={(e) => set('href', e.target.value)} aria-invalid={errors.href || hrefInvalid ? true : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (optional)" htmlFor="ann-start" error={errors.startsAt} hint="Leave empty to start now">
            <Input id="ann-start" type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </Field>
          <Field label="Ends (optional)" htmlFor="ann-end" error={errors.endsAt} hint="Leave empty to run until turned off">
            <Input id="ann-end" type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-2.5">
          <label htmlFor="ann-active" className="text-sm">
            <span className="font-medium">Active</span>
            <span className="block text-xs text-muted">Turn off to hide it without deleting.</span>
          </label>
          <Switch id="ann-active" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {initial.id ? 'Save' : 'Add announcement'}
        </Button>
      </DialogFooter>
    </form>
  );
}
