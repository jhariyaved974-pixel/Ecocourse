'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Activity, BarChart3, Bell, Boxes, Briefcase, ClipboardCheck, CreditCard, FileSignature, FileText, FolderKanban, FolderOpen,
  LayoutDashboard, LifeBuoy, LogOut, Megaphone, Menu, MessagesSquare, Receipt, Settings, Sparkles, Users, UsersRound, Wallet, X,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/types';
import { Logo } from '@/components/ui/logo';
import { Avatar } from '@/components/ui/primitives';

const ICONS = {
  dashboard: LayoutDashboard, projects: FolderKanban, onboarding: ClipboardCheck, contracts: FileSignature, billing: Wallet, files: FolderOpen,
  messages: MessagesSquare, seo: BarChart3, requests: LifeBuoy, settings: Settings, clients: Users, services: Boxes, invoices: Receipt,
  payments: CreditCard, team: UsersRound, announcements: Megaphone, activity: Activity, briefcase: Briefcase, reports: FileText, sparkles: Sparkles,
} as const;
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badgeKey?: 'messages' };
export type NavGroup = { title?: string; items: NavItem[] };

export function AppShell({ nav, children, user, mode, orgName, home }: {
  nav: NavGroup[]; children: ReactNode; user: { id: string; name: string; email: string; role: string }; mode: 'client' | 'admin'; orgName?: string | null; home: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setOpen(false); }  // close the mobile menu after navigating

  // unread message count for the sidebar badge
  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    const load = () => sb.rpc('unread_counts').then(({ data }: { data: { unread: number }[] | null }) => {
      if (alive) setUnreadMessages((data ?? []).reduce((s, r) => s + Number(r.unread), 0));
    });
    load();
    const ch = sb.channel('nav-messages').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load).subscribe();
    const t = setInterval(load, 60000);
    return () => { alive = false; sb.removeChannel(ch); clearInterval(t); };
  }, [pathname]);

  const isActive = (href: string) => (href === home ? pathname === href : pathname === href || pathname.startsWith(href + '/'));
  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col">
      <div className="flex h-[72px] items-center px-6">
        <Link href={home} aria-label="WeberAct home"><Logo sub={mode === 'admin' ? 'Control center' : 'Client portal'} /></Link>
      </div>
      {orgName && (
        <div className="mx-4 mb-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-2.5">
          <p className="eyebrow !text-[10px]">Workspace</p>
          <p className="mt-1 truncate text-[13px] font-medium text-fg-soft">{orgName}</p>
        </div>
      )}
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
        {nav.map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="eyebrow mb-2 px-3 !text-[10px]">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map(item => {
                const Icon = ICONS[item.icon]; const active = isActive(item.href);
                const badge = item.badgeKey === 'messages' && unreadMessages > 0 ? unreadMessages : 0;
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? 'page' : undefined}
                      className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors',
                        active ? 'bg-white/[0.06] text-fg' : 'text-fg-muted hover:bg-white/[0.035] hover:text-fg')}>
                      {active && <motion.span layoutId={`nav-${mode}`} className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-coral-500" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <Icon className={cn('h-[17px] w-[17px] shrink-0 transition', active ? 'text-coral-400' : 'text-fg-faint group-hover:text-fg-muted')} strokeWidth={1.75} />
                      <span className="truncate">{item.label}</span>
                      {badge > 0 && <span className="num ml-auto rounded-full bg-coral-500 px-1.5 py-px text-[10.5px] font-semibold text-ink-950">{badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <UserCard user={user} />
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-line bg-ink-900/95 backdrop-blur lg:block">{sidebar}</aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[284px] border-r border-line bg-ink-900 lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
              <button className="absolute right-3 top-5 rounded-lg p-2 text-fg-muted hover:bg-white/5" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-line bg-ink-950/80 px-4 backdrop-blur-xl md:px-8">
          <button className="rounded-lg p-2 text-fg-muted hover:bg-white/5 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell userId={user.id} notificationsHref={mode === 'admin' ? '/admin/notifications' : '/notifications'} />
            <Link href={mode === 'admin' ? '/admin/settings' : '/settings'} className="hidden items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 transition hover:bg-white/5 sm:flex">
              <Avatar name={user.name} size={30} />
              <span className="max-w-[160px] truncate text-[13px] text-fg-soft">{user.name}</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 py-8 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}

function UserCard({ user }: { user: { name: string; email: string; role: string } }) {
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar name={user.name} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
          <p className="truncate text-[11.5px] text-fg-faint">{user.role === 'client' ? user.email : user.role === 'admin' ? 'Admin' : 'Project manager'}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg p-2 text-fg-faint transition hover:bg-white/5 hover:text-fg" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );
}

// Live notifications: a new row for this person appears at once, with a toast.
function NotificationBell({ userId, notificationsHref }: { userId: string; notificationsHref: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = useMemo(() => items.filter(n => !n.read_at).length, [items]);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(15).then(({ data }: { data: Notification[] | null }) => setItems(data ?? []));
    const ch = sb.channel('notifications-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (p: { new: Notification }) => {
        setItems(prev => [p.new, ...prev].slice(0, 15));
        toast(p.new.title, { description: p.new.body ?? undefined });
        router.refresh();
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId, router]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function markAll() {
    const ids = items.filter(n => !n.read_at).map(n => n.id); if (!ids.length) return;
    const now = new Date().toISOString();
    setItems(items.map(n => (n.read_at ? n : { ...n, read_at: now })));
    await supabaseBrowser().from('notifications').update({ read_at: now }).in('id', ids);
  }
  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read_at) { setItems(items.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))); await supabaseBrowser().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id); }
    if (n.link) router.push(n.link);
  }
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} className="relative rounded-xl p-2.5 text-fg-muted transition hover:bg-white/5 hover:text-fg" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-ink-950">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="card absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden bg-ink-850 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button onClick={markAll} className="text-[12px] text-coral-400 hover:text-coral-300 disabled:opacity-40" disabled={!unread}>Mark all read</button>
            </div>
            <ul className="max-h-[420px] overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-fg-muted">You are all caught up.</li>}
              {items.map(n => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className="flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition hover:bg-white/[0.03]">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-coral-500')} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-fg-muted">{n.body}</span>}
                      <span className="mt-1 block text-[11.5px] text-fg-faint">{ago(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Link href={notificationsHref} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-[12.5px] text-fg-muted hover:text-fg">View all</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
