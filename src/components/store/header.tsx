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
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {department.image ? <FallbackImage src={department.image} alt="" fill sizes="260px" className="object-cover" fallback={fallback} /> : fallback}
    </div>
  );
}

function MegaPanel({ department }: { department: HeaderDepartment }) {
  return (
    <div className="container-x grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_220px] gap-14 py-10">
      <div className="max-w-xs">
        <p className="eyebrow text-muted">The collection</p>
        <p className="mt-3 font-display text-4xl leading-none">{department.name}</p>
        {department.description ? <p className="mt-4 text-sm leading-relaxed text-ink-2">{department.description}</p> : null}
        <NM.Link asChild>
          <Link href={`/category/${department.slug}`} className="label-caps link-rule mt-6 inline-block">
            Shop all {department.name}
          </Link>
        </NM.Link>
      </div>
      <ul className="grid content-start gap-x-10 border-l border-line pl-10 sm:grid-cols-2">
        {department.children.map((c) => (
          <li key={c.slug}>
            <NM.Link asChild>
              <Link href={`/category/${c.slug}`} className="group flex items-baseline justify-between gap-4 border-b border-line py-3 font-display text-[1.45rem] leading-tight">
                <span className="link-draw">{c.name}</span>
                <ArrowRight className="size-3.5 shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-60" aria-hidden />
              </Link>
            </NM.Link>
          </li>
        ))}
      </ul>
      <DepartmentTile department={department} className="aspect-[4/5]" />
    </div>
  );
}

function DesktopNav({ entries, extraDepartments }: { entries: MenuEntry[]; extraDepartments: HeaderDepartment[] }) {
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const itemCls = 'label-caps relative inline-flex items-center gap-1 px-4 py-2 transition-colors hover:text-accent-text data-[state=open]:text-accent-text';

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
    <NM.Root value={value} onValueChange={setValue} delayDuration={120} aria-label="Main" className="hidden lg:block">
      <div className="container-x">
        <NM.List className="flex h-11 items-center justify-center gap-1">
          {entries.map((l) =>
            l.department ? (
              <NM.Item key={l.id} value={l.id}>
                <NM.Trigger className={cn('group', itemCls, l.highlight && 'text-accent-text')} onClick={triggerClick(l.id, l.href)}>
                  {l.label}
                  <ChevronDown className="size-3 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
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
                        <Link href={`/category/${d.slug}`} className="flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm hover:bg-surface-2">
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
        <NM.Viewport className="relative h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden border-y border-line bg-paper text-ink shadow-[0_30px_60px_-40px_rgba(31,25,21,0.35)] transition-[height] duration-300 data-[state=open]:animate-fade-in" />
      </div>
    </NM.Root>
  );
}

function MobileNav({ entries, extraDepartments, onNavigate }: { entries: MenuEntry[]; extraDepartments: HeaderDepartment[]; onNavigate: () => void }) {
  const rowCls = 'flex w-full items-center border-b border-line px-1 py-4 font-display text-2xl leading-none';
  const subLinks = (d: HeaderDepartment) => (
    <ul className="mb-2 ml-3 space-y-0.5 border-l border-line pl-3">
      <li>
        <Link href={`/category/${d.slug}`} onClick={onNavigate} className="block px-3 py-2 text-[15px] font-medium">
          All {d.name}
        </Link>
      </li>
      {d.children.map((c) => (
        <li key={c.slug}>
          <Link href={`/category/${c.slug}`} onClick={onNavigate} className="block px-3 py-2 text-[15px] text-ink-2">
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
                <AccordionTrigger className={cn(rowCls, 'justify-between py-4 text-2xl font-normal hover:text-ink hover:no-underline', l.highlight && 'text-accent-text')}>{l.label}</AccordionTrigger>
                <AccordionContent className="pb-0 text-ink">{subLinks(l.department)}</AccordionContent>
              </AccordionItem>
            ) : (
              <Link href={l.href} onClick={onNavigate} {...linkProps(l)} className={cn(rowCls, l.highlight && 'text-accent-text')}>
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

  const iconBtn = 'relative grid size-10 place-items-center transition-colors hover:text-accent-text';

  return (
    <header
      data-site-header
      data-scrolled={scrolled || undefined}
      className={cn('sticky top-0 z-40 border-b bg-paper text-ink transition-[border-color,box-shadow] duration-300', scrolled ? 'border-line shadow-[0_10px_30px_-24px_rgba(31,25,21,0.4)]' : 'border-transparent')}
    >
      <div className="container-x grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-20">
        <div className="flex items-center gap-1">
          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger className={cn(iconBtn, '-ml-2 lg:hidden')} aria-label="Open menu">
              <Menu className="size-5" strokeWidth={1.5} />
            </DialogTrigger>
            <SheetContent side="left" title={storeName}>
              <nav className="flex-1 overflow-y-auto px-6 py-4" aria-label="Mobile">
                <MobileNav entries={entries} extraDepartments={extraDepartments} onNavigate={close} />
              </nav>
              <div className="grid grid-cols-2 gap-2 border-t border-line p-5">
                <Link href="/account" onClick={close} className="label-caps border border-line-strong px-4 py-3 text-center">Account</Link>
                <Link href="/orders/track" onClick={close} className="label-caps border border-line-strong px-4 py-3 text-center">Track order</Link>
              </div>
            </SheetContent>
          </Dialog>
          <SearchDialog
            trigger={
              <button type="button" className="group hidden items-center gap-2.5 py-2 lg:inline-flex" aria-label="Search">
                <Search className="size-4" strokeWidth={1.5} aria-hidden />
                <span className="label-caps link-draw">Search</span>
              </button>
            }
          />
          <SearchDialog
            hotkey={false}
            trigger={
              <button type="button" className={cn(iconBtn, 'lg:hidden')} aria-label="Search">
                <Search className="size-[18px]" strokeWidth={1.5} />
              </button>
            }
          />
        </div>

        <Link href="/" className="flex min-w-0 items-center justify-center" aria-label={`${storeName} home`}>
          {logoUrl ? (
            <Image src={logoUrl} alt={storeName} width={180} height={40} className="h-8 w-auto object-contain lg:h-9" priority />
          ) : (
            <Wordmark name={storeName} className="text-[1.35rem] sm:text-[1.6rem] lg:text-[1.85rem]" />
          )}
        </Link>

        <div className="flex items-center justify-end gap-0.5">
          <Link href="/account" className={cn(iconBtn, 'hidden sm:grid')} aria-label="Account">
            <User2 className="size-[18px]" strokeWidth={1.5} />
          </Link>
          <Link href="/wishlist" className={cn(iconBtn, 'hidden sm:grid')} aria-label={`Wishlist${wishlist.count ? `, ${wishlist.count} items` : ''}`}>
            <Heart className="size-[18px]" strokeWidth={1.5} />
            {wishlist.count ? <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent" aria-hidden /> : null}
          </Link>
          <button type="button" onClick={openCartDrawer} className="group -mr-1 inline-flex h-10 items-center gap-2 pl-2 hover:text-accent-text" aria-label={`Open bag${count ? `, ${count} items` : ', empty'}`}>
            <ShoppingBag className="size-[18px]" strokeWidth={1.5} />
            <span className="label-caps hidden tabular-nums sm:inline" aria-hidden>
              Bag{count ? ` (${count > 99 ? '99+' : count})` : ''}
            </span>
            {count ? (
              <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-4 font-medium text-accent-ink tabular-nums sm:hidden" aria-hidden>
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
