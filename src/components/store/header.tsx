'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Menu, Search, ShoppingBag, User2 } from 'lucide-react';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { openCartDrawer, useCart } from '@/lib/cart/store';
import { useWishlist } from '@/lib/wishlist/store';
import { SearchDialog } from './search-dialog';

export interface HeaderProps {
  storeName: string;
  logoUrl: string | null;
  links: { id: string; label: string; href: string; highlight: boolean; newTab: boolean }[];
  categories: { slug: string; name: string; image: string | null }[];
}

export function Header({ storeName, logoUrl, links, categories }: HeaderProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const { count } = useCart();
  const wishlist = useWishlist();
  const close = () => setMenuOpen(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-site-header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-line bg-paper/85 text-ink backdrop-blur-xl transition-[background-color,border-color,color,backdrop-filter] duration-300"
    >
      <div className="container-x flex h-16 items-center gap-4 lg:h-[72px]">
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger className="-ml-2 rounded-full p-2 transition-colors hover:bg-current/8 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </DialogTrigger>
          <SheetContent side="left" title={storeName}>
            <nav className="flex-1 overflow-y-auto px-5 py-6" aria-label="Mobile">
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={l.href}
                      onClick={close}
                      className={cn('block rounded-lg px-3 py-3 text-lg font-medium hover:bg-surface-2', l.highlight && 'text-accent')}
                      target={l.newTab ? '_blank' : undefined}
                      rel={l.newTab ? 'noopener noreferrer' : undefined}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {categories.length ? (
                <>
                  <p className="eyebrow mt-8 mb-3 px-3 text-muted">Categories</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {categories.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/category/${c.slug}`} onClick={close} className="group block overflow-hidden rounded-xl bg-surface-2">
                          {c.image ? (
                            <Image src={c.image} alt="" width={300} height={220} className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : null}
                          <span className="block px-3 py-2 text-sm font-medium">{c.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </nav>
            <div className="grid grid-cols-2 gap-2 border-t border-line p-5">
              <Link href="/account" onClick={close} className="rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium">Account</Link>
              <Link href="/orders/track" onClick={close} className="rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium">Track order</Link>
            </div>
          </SheetContent>
        </Dialog>

        <Link href="/" className="flex items-center gap-2" aria-label={`${storeName} home`}>
          {logoUrl ? (
            <Image src={logoUrl} alt={storeName} width={140} height={36} className="h-8 w-auto object-contain" priority />
          ) : (
            <span className="font-display text-[1.65rem] leading-none tracking-[0.08em] uppercase">{storeName}</span>
          )}
        </Link>

        <nav className="mx-auto hidden lg:block" aria-label="Main">
          <ul className="flex items-center gap-1">
            {links.map((l) => {
              return (
                <li key={l.id}>
                  <Link
                    href={l.href}
                    target={l.newTab ? '_blank' : undefined}
                    rel={l.newTab ? 'noopener noreferrer' : undefined}
                    className={cn('relative rounded-full px-3.5 py-2 text-[13px] font-medium tracking-wide transition-colors hover:bg-current/8', l.highlight && 'text-accent')}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
          <SearchDialog
            trigger={
              <button className={'rounded-full p-2.5 transition-colors hover:bg-current/8'} aria-label="Search products">
                <Search className="size-[18px]" />
              </button>
            }
          />
          <Link
            href="/wishlist"
            className={'relative hidden rounded-full p-2.5 transition-colors hover:bg-current/8 sm:block'}
            aria-label={`Wishlist${wishlist.count ? `, ${wishlist.count} items` : ''}`}
          >
            <Heart className="size-[18px]" />
            {wishlist.count ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" aria-hidden /> : null}
          </Link>
          <Link
            href="/account"
            className={'hidden rounded-full p-2.5 transition-colors hover:bg-current/8 sm:block'}
            aria-label="Account"
          >
            <User2 className="size-[18px]" />
          </Link>
          <button
            onClick={openCartDrawer}
            className={'relative rounded-full p-2.5 transition-colors hover:bg-current/8'}
            aria-label={`Open cart${count ? `, ${count} items` : ', empty'}`}
          >
            <ShoppingBag className="size-[18px]" />
            {count ? (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] leading-5 font-bold text-accent-ink tabular-nums">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
