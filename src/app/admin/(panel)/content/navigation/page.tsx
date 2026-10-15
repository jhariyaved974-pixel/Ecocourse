import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/admin/ui';
import { Notice } from '@/components/ui/misc';
import { NavigationManager, type NavLinkRow } from '@/components/admin/content/navigation-manager';

export const metadata: Metadata = { title: 'Navigation' };

const STATIC_LINKS = [
  { href: '/shop', label: 'All products' },
  { href: '/shop?flag=new', label: 'New arrivals' },
  { href: '/shop?flag=bestseller', label: 'Bestsellers' },
  { href: '/shop?sale=1', label: 'Sale' },
  { href: '/size-guide', label: 'Size guide' },
  { href: '/faq', label: 'FAQ' },
  { href: '/orders/track', label: 'Track an order' },
  { href: '/account', label: 'Account' },
  { href: '/wishlist', label: 'Wishlist' },
];

export default async function NavigationPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [linksRes, pagesRes, categoriesRes, collectionsRes] = await Promise.all([
    supabase.from('navigation_links').select('id, menu, group_title, label, href, sort_order, is_visible, highlight, open_in_new_tab, updated_at').order('sort_order').order('label'),
    supabase.from('pages').select('slug, title, draft_title').order('title'),
    supabase.from('categories').select('slug, name').order('sort_order'),
    supabase.from('collections').select('slug, name').order('sort_order'),
  ]);
  const links: NavLinkRow[] = (linksRes.data ?? []).map((l) => ({
    id: l.id,
    menu: l.menu === 'footer' ? 'footer' : 'header',
    label: l.label,
    href: l.href,
    groupTitle: l.group_title,
    isVisible: l.is_visible,
    highlight: l.highlight,
    openInNewTab: l.open_in_new_tab,
    updatedAt: l.updated_at,
  }));
  const suggestions = [
    ...STATIC_LINKS,
    ...(categoriesRes.data ?? []).map((c) => ({ href: `/category/${c.slug}`, label: `Category: ${c.name}` })),
    ...(collectionsRes.data ?? []).map((c) => ({ href: `/collections/${c.slug}`, label: `Collection: ${c.name}` })),
    ...(pagesRes.data ?? []).map((p) => ({ href: `/pages/${p.slug}`, label: `Page: ${p.draft_title ?? p.title}` })),
  ];

  return (
    <>
      <PageHeader title="Navigation" description="Header and footer menus. Changes go live as soon as you save them." />
      {linksRes.error ? (
        <Notice tone="danger" className="mb-6">
          Menus could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      <NavigationManager links={links} suggestions={suggestions} />
    </>
  );
}
