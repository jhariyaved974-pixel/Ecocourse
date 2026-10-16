import type { StaffRole } from '@/lib/auth';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in the client nav
  roles: readonly StaffRole[];
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

const ALL: readonly StaffRole[] = ['owner', 'admin', 'editor', 'support'];
const ADMIN: readonly StaffRole[] = ['owner', 'admin'];
const CATALOG: readonly StaffRole[] = ['owner', 'admin', 'editor'];
const ORDERS: readonly StaffRole[] = ['owner', 'admin', 'support'];

/** Navigation only hides links; every page and action checks the role again on the server. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: 'LayoutDashboard', roles: ALL }],
  },
  {
    title: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: 'ShoppingBag', roles: ORDERS },
      { href: '/admin/payments', label: 'UPI payments', icon: 'BadgeIndianRupee', roles: ADMIN },
      { href: '/admin/customers', label: 'Customers', icon: 'Users', roles: ORDERS },
      { href: '/admin/requests', label: 'Customer requests', icon: 'Inbox', roles: ORDERS },
      { href: '/admin/coupons', label: 'Coupons', icon: 'TicketPercent', roles: ADMIN },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', icon: 'Package', roles: CATALOG },
      { href: '/admin/inventory', label: 'Inventory', icon: 'Boxes', roles: CATALOG },
      { href: '/admin/categories', label: 'Categories & brands', icon: 'FolderTree', roles: CATALOG },
      { href: '/admin/collections', label: 'Collections', icon: 'LayoutGrid', roles: CATALOG },
      { href: '/admin/reviews', label: 'Reviews', icon: 'MessageSquareText', roles: ORDERS },
      { href: '/admin/media', label: 'Media library', icon: 'Images', roles: CATALOG },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/admin/content/homepage', label: 'Homepage', icon: 'Home', roles: CATALOG },
      { href: '/admin/content/pages', label: 'Pages', icon: 'FileText', roles: CATALOG },
      { href: '/admin/content/navigation', label: 'Navigation', icon: 'Menu', roles: CATALOG },
      { href: '/admin/content/announcements', label: 'Announcements', icon: 'Megaphone', roles: CATALOG },
      { href: '/admin/content/faqs', label: 'FAQs', icon: 'CircleHelp', roles: CATALOG },
      { href: '/admin/content/size-guides', label: 'Size guides', icon: 'Ruler', roles: CATALOG },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/settings', label: 'Store settings', icon: 'Store', roles: ADMIN },
      { href: '/admin/settings/payments', label: 'Payment settings', icon: 'Wallet', roles: ADMIN },
      { href: '/admin/settings/shipping', label: 'Shipping & tax', icon: 'Truck', roles: ADMIN },
      { href: '/admin/settings/staff', label: 'Staff & security', icon: 'ShieldCheck', roles: ADMIN },
      { href: '/admin/audit', label: 'Audit log', icon: 'ScrollText', roles: ADMIN },
    ],
  },
];
