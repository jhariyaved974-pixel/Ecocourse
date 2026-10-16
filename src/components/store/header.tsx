'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { NavigationMenu as NM } from 'radix-ui';
import { ArrowRight, ChevronDown, Heart, Menu, Search, ShoppingBag, User2 } from 'lucide-react';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/menus';
import { cn } from '@/lib/utils';
import { openCartDrawer, useCart } from '@/lib/cart/store';
import { useWishlist } from '@/lib/wishlist/store';
import { SearchDialog } from './search-dialog';
import { Wordmark } from './wordmark';
import { FallbackImage } from './fallback-image';
import { DepartmentIcon } from './department-icon';

export interface HeaderDepartment {
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  children: { slug: string; name: string }[];
}

export interface HeaderProps {
  storeName: string;
  logoUrl: string | null;
  /** Header links from Admin > Navigation, in order. */
  links: { id: string; label: string; href: string; highlight: boolean; newTab: boolean }[];
  /** Category tree; links to /category/<department> get its sub-categories as a menu. */
  departments: HeaderDepartment[];
}

type MenuEntry = HeaderProps['links'][number] & { department: HeaderDepartment | null };

/** Attaches departments (with sub-categories) to the CMS links that point at them. */
function useMenuEntries(links: HeaderProps['links'], departments: HeaderDepartment[]) {
  return React.useMemo(() => {
    const bySlug = new Map(departments.map((d) => [d.slug, d]));
    const entries: MenuEntry[] = links.map((l) => {
      const slug = /^\/category\/([a-z0-9-]+)\/?$/.exec(l.href)?.[1];
      const d = slug ? bySlug.get(slug) : undefined;
      return { ...l, department: d && d.children.length ? d : null };
    });
    // When no link points at a department, departments are offered separately.
    const linked = links.some((l) => departments.some((d) => l.href.replace(/\/$/, '') === `/category/${d.slug}`));
    return { entries, extraDepartments: linked ? [] : departments };
  }, [links, departments]);
}

const linkProps = (l: { newTab: boolean }) => (l.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {});

function DepartmentTile({ department, className }: { department: HeaderDepartment; className?: string }) {
  const fallback = (
    <div className="grid h-full place-items-center bg-gradient-to-br from-surface-2 to-line text-ink-2">
      <DepartmentIcon slug={department.slug} className="size-10" strokeWidth={1.4} />
    </div>
  );
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-surface-2', className)}>
      {department.image ? <FallbackImage src={department.image} alt="" fill sizes="260px" className="object-cover" fallback={fallback} /> : fallback}
    </div>
  );
}

function MegaPanel({ department }: { department: HeaderDepartment }) {
  return (
    <div className="container-x grid grid-cols-[260px_minmax(0,1fr)_240px] gap-12 py-8">
      <div>
        <p className="eyebrow text-muted">Department</p>
        <p className="mt-2 font-display text-3xl leading-tight">{department.name}</p>
        {department.description ? <p className="mt-2 text-sm text-muted">{department.description}</p> : null}
        <NM.Link asChild>
          <Link href={`/category/${department.slug}`} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
            Shop all {department.name}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </NM.Link>
      </div>
      <ul className="grid grid-cols-[repeat(2,minmax(0,260px))] content-start gap-x-6 gap-y-0.5 border-l border-line pl-8">
        {department.children.map((c) => (
          <li key={c.slug}>
            <NM.Link asChild>
              <Link href={`/category/${c.slug}`} className="block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2">
                {c.name}
              </Link>
            </NM.Link>
          </li>
        ))}
      </ul>
      <DepartmentTile department={department} className="aspect-[4/3]" />
    </div>
  );
}

function DesktopNav({ entries, extraDepartments }: { entries: MenuEntry[]; extraDepartments: HeaderDepartment[] }) {
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const itemCls = 'relative inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium tracking-wide transition-colors hover:bg-current/8 data-[state=open]:bg-current/8';

  // A mouse click on a department whose menu is already open (opened by hovering)
  // goes to the department page instead of closing the menu.
  const triggerClick = (id: string, href: string) => (e: React.MouseEvent) => {
    if (e.detail > 0 && value === id) {
      e.preventDefault();
      setValue('');
      router.push(href);
    }
  };

  return (
    <NM.Root value={value} onValueChange={setValue} delayDuration={120} aria-label="Main" className="hidden border-t border-current/10 xl:block">
      <div className="container-x">
        <NM.List className="flex h-11 items-center gap-0.5">
          {entries.map((l) =>
            l.department ? (
              <NM.Item key={l.id} value={l.id}>
                <NM.Trigger className={cn('group', itemCls, l.highlight && 'text-accent-text')} onClick={triggerClick(l.id, l.href)}>
                  {l.label}
                  <ChevronDown className="size-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                </NM.Trigger>
                <NM.Content className="w-full data-[motion]:animate-fade-in">
                  <MegaPanel department={l.department} />
                </NM.Content>
              </NM.Item>
            ) : (
              <NM.Item key={l.id}>
                <NM.Link asChild>
                  <Link href={l.href} {...linkProps(l)} className={cn(itemCls, l.highlight && 'text-accent-text')}>
                    {l.label}
                  </Link>
                </NM.Link>
              </NM.Item>
            ),
          )}
          {extraDepartments.length ? (
            <NM.Item value="departments">
              <NM.Trigger className={itemCls}>
                Departments <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </NM.Trigger>
              <NM.Content className="w-full">
                <ul className="container-x grid grid-cols-4 gap-2 py-8">
                  {extraDepartments.map((d) => (
                    <li key={d.slug}>
                      <NM.Link asChild>
                        <Link href={`/category/${d.slug}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-2">
                          <DepartmentIcon slug={d.slug} className="size-4 text-muted" />
                          {d.name}
                        </Link>
                      </NM.Link>
                    </li>
                  ))}
                </ul>
              </NM.Content>
            </NM.Item>
          ) : null}
        </NM.List>
      </div>
      {/* The open panel drops down below the whole header, full width. */}
      <div className="absolute inset-x-0 top-full">
        <NM.Viewport className="relative h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden border-b border-line bg-surface text-ink shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)] transition-[height] duration-200 data-[state=open]:animate-fade-in" />
      </div>
    </NM.Root>
  );
}

function MobileNav({ entries, extraDepartments, onNavigate }: { entries: MenuEntry[]; extraDepartments: HeaderDepartment[]; onNavigate: () => void }) {
  const rowCls = 'flex w-full items-center rounded-lg px-3 py-3 text-lg font-medium hover:bg-surface-2';
  const subLinks = (d: HeaderDepartment) => (
    <ul className="mb-2 ml-3 space-y-0.5 border-l border-line pl-3">
      <li>
        <Link href={`/category/${d.slug}`} onClick={onNavigate} className="block rounded-lg px-3 py-2 text-[15px] font-medium hover:bg-surface-2">
          All {d.name}
        </Link>
      </li>
      {d.children.map((c) => (
        <li key={c.slug}>
          <Link href={`/category/${c.slug}`} onClick={onNavigate} className="block rounded-lg px-3 py-2 text-[15px] text-ink-2 hover:bg-surface-2">
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <Accordion type="single" collapsible>
      <ul className="space-y-0.5">
        {entries.map((l) => (
          <li key={l.id}>
            {l.department ? (
              <AccordionItem value={l.id} className="border-0">
                <AccordionTrigger className={cn(rowCls, 'justify-between py-3 text-lg hover:text-ink', l.highlight && 'text-accent')}>{l.label}</AccordionTrigger>
                <AccordionContent className="pb-0 text-ink">{subLinks(l.department)}</AccordionContent>
              </AccordionItem>
            ) : (
              <Link href={l.href} onClick={onNavigate} {...linkProps(l)} className={cn(rowCls, l.highlight && 'text-accent')}>
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {extraDepartments.length ? (
        <>
          <p className="eyebrow mt-8 mb-2 px-3 text-muted">Departments</p>
          <ul className="space-y-0.5">
            {extraDepartments.map((d) => (
              <li key={d.slug}>
                {d.children.length ? (
                  <AccordionItem value={`d-${d.slug}`} className="border-0">
                    <AccordionTrigger className={cn(rowCls, 'justify-between py-3 text-base')}>{d.name}</AccordionTrigger>
                    <AccordionContent className="pb-0 text-ink">{subLinks(d)}</AccordionContent>
                  </AccordionItem>
                ) : (
                  <Link href={`/category/${d.slug}`} onClick={onNavigate} className={cn(rowCls, 'text-base')}>
                    {d.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Accordion>
  );
}

export function Header({ storeName, logoUrl, links, departments }: HeaderProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { count } = useCart();
  const wishlist = useWishlist();
  const close = () => setMenuOpen(false);
  const { entries, extraDepartments } = useMenuEntries(links, departments);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const iconBtn = 'relative rounded-full p-2.5 transition-colors hover:bg-current/8';

  return (
    <header
      data-site-header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-line bg-paper/85 text-ink backdrop-blur-xl transition-[background-color,border-color,color,backdrop-filter] duration-300"
    >
      <div className="container-x flex h-16 items-center gap-3 lg:h-[72px] lg:gap-6">
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger className="-ml-2 rounded-full p-2 transition-colors hover:bg-current/8 xl:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </DialogTrigger>
          <SheetContent side="left" title={storeName}>
            <nav className="flex-1 overflow-y-auto px-5 py-4" aria-label="Mobile">
              <MobileNav entries={entries} extraDepartments={extraDepartments} onNavigate={close} />
            </nav>
            <div className="grid grid-cols-2 gap-2 border-t border-line p-5">
              <Link href="/account" onClick={close} className="rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium">Account</Link>
              <Link href="/orders/track" onClick={close} className="rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium">Track order</Link>
            </div>
          </SheetContent>
        </Dialog>

        <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label={`${storeName} home`}>
          {logoUrl ? (
            <Image src={logoUrl} alt={storeName} width={160} height={36} className="h-8 w-auto object-contain" priority />
          ) : (
            <Wordmark name={storeName} className="text-[1.3rem] sm:text-[1.5rem]" markClassName="size-7 sm:size-8" />
          )}
        </Link>

        <SearchDialog
          trigger={
            <button
              type="button"
              className="mx-auto hidden h-11 w-full max-w-xl flex-1 items-center gap-3 rounded-full border border-current/15 bg-current/[0.04] px-4 text-left text-sm transition-colors hover:border-current/30 md:flex"
              aria-label="Search products"
            >
              <Search className="size-[18px] shrink-0 opacity-70" aria-hidden />
              <span className="flex-1 truncate opacity-70">Search products</span>
              <kbd className="hidden rounded border border-current/20 px-1.5 py-0.5 font-mono text-[10px] opacity-60 lg:inline" aria-hidden>
                Ctrl K
              </kbd>
            </button>
          }
        />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
          <SearchDialog
            hotkey={false}
            trigger={
              <button type="button" className={cn(iconBtn, 'md:hidden')} aria-label="Search products">
                <Search className="size-[18px]" />
              </button>
            }
          />
          <Link href="/wishlist" className={cn(iconBtn, 'hidden sm:block')} aria-label={`Wishlist${wishlist.count ? `, ${wishlist.count} items` : ''}`}>
            <Heart className="size-[18px]" />
            {wishlist.count ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" aria-hidden /> : null}
          </Link>
          <Link href="/account" className={cn(iconBtn, 'hidden sm:block')} aria-label="Account">
            <User2 className="size-[18px]" />
          </Link>
          <button type="button" onClick={openCartDrawer} className={iconBtn} aria-label={`Open cart${count ? `, ${count} items` : ', empty'}`}>
            <ShoppingBag className="size-[18px]" />
            {count ? (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] leading-5 font-bold text-accent-ink tabular-nums">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </button>
        </div>
      </div>
      <DesktopNav entries={entries} extraDepartments={extraDepartments} />
    </header>
  );
}
