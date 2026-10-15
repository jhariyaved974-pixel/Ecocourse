'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BadgeIndianRupee, Boxes, CircleHelp, FileText, FolderTree, Footprints, Home, Images, Inbox, LayoutDashboard, LayoutGrid,
  LogOut, Megaphone, Menu, MessageSquareText, Ruler, ScrollText, ShieldCheck, ShoppingBag, Store, TicketPercent, Truck, Users, Wallet, X,
} from 'lucide-react';
import { ADMIN_NAV } from '@/lib/admin/nav';
import type { StaffRole } from '@/lib/auth';
import { cn, titleCase } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BadgeIndianRupee, Boxes, CircleHelp, FileText, FolderTree, Footprints, Home, Images, Inbox, LayoutDashboard, LayoutGrid,
  Megaphone, Menu, MessageSquareText, Ruler, ScrollText, ShieldCheck, ShoppingBag, Store, TicketPercent, Truck, Users, Wallet,
};

function NavLinks({ role, onNavigate }: { role: StaffRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Longest matching href wins so /admin/settings/payments does not also highlight /admin/settings.
  const all = ADMIN_NAV.flatMap((g) => g.items).filter((i) => i.roles.includes(role));
  const active = all
    .filter((i) => (i.href === '/admin' ? pathname === '/admin' : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Admin" className="space-y-6">
      {ADMIN_NAV.map((group) => {
        const items = group.items.filter((i) => i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase">{group.title}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const isActive = item.href === active;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors', isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-surface-2')}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminNav({ role, email, storeName, signOut }: { role: StaffRole; email: string; storeName: string; signOut: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const footer = (
    <div className="border-t border-line p-4 text-xs">
      <p className="truncate font-medium" title={email}>{email}</p>
      <p className="text-muted">{titleCase(role)}</p>
      <form action={signOut} className="mt-3">
        <button type="submit" className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
  const brand = (
    <div className="flex h-14 items-center justify-between px-4">
      <Link href="/admin" className="font-display text-xl tracking-wide">{storeName}</Link>
      <Link href="/" target="_blank" className="text-xs text-muted hover:text-ink">View store ↗</Link>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks role={role} />
        </div>
        {footer}
      </aside>
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link href="/admin" className="font-display text-lg">{storeName}</Link>
        <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Open admin menu">
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close admin menu" />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between px-4">
              <span className="font-display text-lg">{storeName}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="Close admin menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </div>
        </div>
      ) : null}
    </>
  );
}
