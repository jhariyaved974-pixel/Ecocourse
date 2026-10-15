'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/account/requests', label: 'Help & privacy' },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {LINKS.map((l) => {
        const active = l.href === '/account' ? pathname === '/account' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn('shrink-0 rounded-full px-4 py-2 text-sm transition-colors lg:rounded-lg', active ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-surface-2')}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
