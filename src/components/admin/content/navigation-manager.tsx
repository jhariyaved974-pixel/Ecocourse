'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Sparkle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Switch } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { deleteNavigationLink, reorderNavigation, saveNavigationLink, setNavigationLinkVisibility } from '@/app/admin/(panel)/content/navigation/actions';
import { HREF_HINT, NAV_LIMITS, isSafeHref, type NavMenu } from '@/lib/admin/content';
import { cn } from '@/lib/utils';
import { DragHandle, SortableList, orderBy, useLocalOrder, type DragHandleBinding } from './sortable';

export interface NavLinkRow {
  id: string;
  menu: NavMenu;
  label: string;
  href: string;
  groupTitle: string | null;
  isVisible: boolean;
  highlight: boolean;
  openInNewTab: boolean;
  updatedAt: string;
}

interface LinkDraft {
  id: string | null;
  menu: NavMenu;
  label: string;
  href: string;
  groupTitle: string;
  isVisible: boolean;
  highlight: boolean;
  openInNewTab: boolean;
}

/** Groups footer links into columns in order of first appearance (matches the storefront). */
function columnsOf(links: NavLinkRow[]) {
  const map = new Map<string, NavLinkRow[]>();
  for (const l of links) {
    const key = l.groupTitle ?? 'More';
    map.set(key, [...(map.get(key) ?? []), l]);
  }
  return [...map.entries()].map(([title, items]) => ({ title, items }));
}

export function NavigationManager({ links, suggestions }: { links: NavLinkRow[]; suggestions: { href: string; label: string }[] }) {
  const header = links.filter((l) => l.menu === 'header');
  const footer = links.filter((l) => l.menu === 'footer');
  const [editing, setEditing] = React.useState<LinkDraft | null>(null);
  const footerColumns = columnsOf(footer).map((c) => c.title);

  const newLink = (menu: NavMenu, groupTitle = ''): LinkDraft => ({ id: null, menu, label: '', href: '', groupTitle, isVisible: true, highlight: false, openInNewTab: false });
  const edit = (l: NavLinkRow): LinkDraft => ({
    id: l.id,
    menu: l.menu,
    label: l.label,
    href: l.href,
    groupTitle: l.groupTitle ?? '',
    isVisible: l.isVisible,
    highlight: l.highlight,
    openInNewTab: l.openInNewTab,
  });

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <MenuPanel
          menu="header"
          title="Header menu"
          description="Top navigation on desktop and the mobile menu. Highlighted links use the accent colour."
          links={header}
          onAdd={() => setEditing(newLink('header'))}
          onEdit={(l) => setEditing(edit(l))}
        />
        <MenuPanel
          menu="footer"
          title="Footer menu"
          description="Links grouped into columns by their column title. Drag links within a column; use the arrows to order columns."
          links={footer}
          onAdd={(group) => setEditing(newLink('footer', group ?? footerColumns[0] ?? ''))}
          onEdit={(l) => setEditing(edit(l))}
        />
      </div>
      <LinkDialog draft={editing} onClose={() => setEditing(null)} columns={footerColumns} suggestions={suggestions} />
    </>
  );
}

function MenuPanel({
  menu,
  title,
  description,
  links,
  onAdd,
  onEdit,
}: {
  menu: NavMenu;
  title: string;
  description: string;
  links: NavLinkRow[];
  onAdd: (group?: string) => void;
  onEdit: (link: NavLinkRow) => void;
}) {
  const { run } = useActionRunner();
  const [ids, setIds, resetIds] = useLocalOrder(links.map((l) => l.id));
  const ordered = orderBy(links, ids);
  const [visibility, setVisibility] = React.useState<Record<string, { base: string; value: boolean }>>({});
  const visibleOf = (l: NavLinkRow) => (visibility[l.id]?.base === l.updatedAt ? visibility[l.id].value : l.isVisible);

  const saveOrder = async (next: string[]) => {
    setIds(next);
    const res = await run(() => reorderNavigation({ menu, ids: next }), { success: 'Menu order saved' });
    if (!res.ok) resetIds();
  };
  const toggle = async (l: NavLinkRow, value: boolean) => {
    setVisibility((v) => ({ ...v, [l.id]: { base: l.updatedAt, value } }));
    const res = await run(() => setNavigationLinkVisibility({ id: l.id, visible: value }));
    if (!res.ok) setVisibility((v) => ({ ...v, [l.id]: { base: '', value } }));
  };

  const row = (l: NavLinkRow, handle: DragHandleBinding) => (
    <LinkRow key={l.id} link={l} visible={visibleOf(l)} handle={handle} onToggle={(v) => toggle(l, v)} onEdit={() => onEdit(l)} />
  );

  const columns = columnsOf(ordered);

  return (
    <Panel
      title={`${title} (${links.length})`}
      description={description}
      actions={
        <Button size="sm" variant="outline" onClick={() => onAdd()}>
          <Plus /> Add link
        </Button>
      }
    >
      {links.length === 0 ? (
        <EmptyState title="No links yet" description="Add a link to build this menu." />
      ) : menu === 'header' ? (
        <SortableList label={title} items={ordered} itemLabel={(l) => l.label} onReorder={saveOrder} className="space-y-1.5" renderItem={(l, handle) => row(l, handle)} />
      ) : (
        <div className="space-y-4">
          {columns.map((col, ci) => (
            <section key={col.title} aria-label={`Footer column ${col.title}`} className="rounded-lg border border-line bg-surface-2/40 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{col.title}</h3>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move column ${col.title} up`}
                    disabled={ci === 0}
                    onClick={() => {
                      const next = [...columns];
                      [next[ci - 1], next[ci]] = [next[ci], next[ci - 1]];
                      void saveOrder(next.flatMap((c) => c.items.map((i) => i.id)));
                    }}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move column ${col.title} down`}
                    disabled={ci === columns.length - 1}
                    onClick={() => {
                      const next = [...columns];
                      [next[ci], next[ci + 1]] = [next[ci + 1], next[ci]];
                      void saveOrder(next.flatMap((c) => c.items.map((i) => i.id)));
                    }}
                  >
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onAdd(col.title)} aria-label={`Add a link to column ${col.title}`}>
                    <Plus /> Link
                  </Button>
                </div>
              </div>
              <SortableList
                label={`Links in ${col.title}`}
                items={col.items}
                itemLabel={(l) => l.label}
                onReorder={(colIds) => void saveOrder(columns.flatMap((c, i) => (i === ci ? colIds : c.items.map((x) => x.id))))}
                className="space-y-1.5"
                renderItem={(l, handle) => row(l, handle)}
              />
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

function LinkRow({ link, visible, handle, onToggle, onEdit }: { link: NavLinkRow; visible: boolean; handle: DragHandleBinding; onToggle: (v: boolean) => void; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pr-1.5 pl-1">
      <DragHandle handle={handle} label={`Reorder ${link.label}`} />
      <div className={cn('min-w-0 flex-1', !visible && 'opacity-55')}>
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className={cn(link.highlight && 'text-accent')}>{link.label}</span>
          {link.highlight ? (
            <Badge tone="accent">
              <Sparkle className="size-3" aria-hidden /> Highlight
            </Badge>
          ) : null}
          {link.openInNewTab ? (
            <Badge tone="outline">
              <ExternalLink className="size-3" aria-hidden /> New tab
            </Badge>
          ) : null}
          {!visible ? <Badge tone="neutral">Hidden</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted">{link.href}</p>
      </div>
      <Switch checked={visible} onCheckedChange={onToggle} aria-label={`Show ${link.label}`} />
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${link.label}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <ConfirmActionButton
        title={`Delete “${link.label}”?`}
        description={`The link to ${link.href} is removed from the ${link.menu} menu. You can hide it instead to keep it for later.`}
        confirmLabel="Delete link"
        danger
        variant="ghost"
        size="icon-sm"
        action={() => deleteNavigationLink(link.id)}
      >
        <Trash2 />
        <span className="sr-only">Delete {link.label}</span>
      </ConfirmActionButton>
    </div>
  );
}

function LinkDialog({ draft, onClose, columns, suggestions }: { draft: LinkDraft | null; onClose: () => void; columns: string[]; suggestions: { href: string; label: string }[] }) {
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        {draft ? <LinkForm key={draft.id ?? `new-${draft.menu}-${draft.groupTitle}`} initial={draft} onDone={onClose} columns={columns} suggestions={suggestions} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ initial, onDone, columns, suggestions }: { initial: LinkDraft; onDone: () => void; columns: string[]; suggestions: { href: string; label: string }[] }) {
  const { run, pending } = useActionRunner();
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof LinkDraft>(key: K, value: LinkDraft[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };
  const hrefInvalid = form.href.trim() !== '' && !isSafeHref(form.href.trim());
  const external = form.href.trim().startsWith('https://');

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(() => saveNavigationLink(form), { onSuccess: onDone });
        setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial.id ? 'Edit link' : 'Add link'}</DialogTitle>
        <DialogDescription>Links can point to a page of this store (starting with /) or to a secure external site (https://).</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Menu" htmlFor="nav-menu">
          <NativeSelect id="nav-menu" value={form.menu} onChange={(e) => set('menu', e.target.value as NavMenu)}>
            <option value="header">Header</option>
            <option value="footer">Footer</option>
          </NativeSelect>
        </Field>
        {form.menu === 'footer' ? (
          <Field label="Column title" htmlFor="nav-group" required error={errors.groupTitle} hint="Links with the same title share a column.">
            <Input id="nav-group" list="nav-group-options" value={form.groupTitle} maxLength={NAV_LIMITS.group} placeholder="Help" onChange={(e) => set('groupTitle', e.target.value)} aria-invalid={errors.groupTitle ? true : undefined} />
            <datalist id="nav-group-options">
              {columns.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Label" htmlFor="nav-label" required error={errors.label} hint={`${form.label.length}/${NAV_LIMITS.label}`}>
          <Input id="nav-label" value={form.label} maxLength={NAV_LIMITS.label} placeholder="Sneakers" onChange={(e) => set('label', e.target.value)} aria-invalid={errors.label ? true : undefined} />
        </Field>
        <Field label="Link" htmlFor="nav-href" required error={errors.href ?? (hrefInvalid ? 'Use an on-site path starting with / or a full https:// address.' : undefined)} hint={HREF_HINT}>
          <Input id="nav-href" list="nav-href-options" value={form.href} maxLength={500} placeholder="/category/sneakers" onChange={(e) => set('href', e.target.value)} aria-invalid={errors.href || hrefInvalid ? true : undefined} />
          <datalist id="nav-href-options">
            {suggestions.map((s) => (
              <option key={s.href} value={s.href}>
                {s.label}
              </option>
            ))}
          </datalist>
        </Field>
      </div>
      <div className="mt-5 space-y-2">
        <ToggleRow id="nav-visible" label="Visible" description="Hidden links stay here but are not shown in the store." checked={form.isVisible} onChange={(v) => set('isVisible', v)} />
        {form.menu === 'header' ? (
          <ToggleRow id="nav-highlight" label="Highlight" description="Accent colour, e.g. for Sale." checked={form.highlight} onChange={(v) => set('highlight', v)} />
        ) : null}
        <ToggleRow
          id="nav-newtab"
          label="Open in a new tab"
          description={external ? 'Recommended for links to other websites.' : 'Usually off for pages of this store.'}
          checked={form.openInNewTab}
          onChange={(v) => set('openInNewTab', v)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {initial.id ? 'Save link' : 'Add link'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ToggleRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-2.5">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
