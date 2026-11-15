import { requireStaff } from '@/lib/auth';
import { AppShell, type NavGroup } from '@/components/shell/app-shell';

const NAV: NavGroup[] = [
  { items: [{ href: '/admin', label: 'Overview', icon: 'dashboard' }] },
  { title: 'Clients', items: [
    { href: '/admin/clients', label: 'Clients', icon: 'clients' },
    { href: '/admin/projects', label: 'Projects', icon: 'projects' },
    { href: '/admin/services', label: 'Services', icon: 'services' },
    { href: '/admin/onboarding', label: 'Onboarding', icon: 'onboarding' },
  ] },
  { title: 'Finance', items: [
    { href: '/admin/contracts', label: 'Contracts', icon: 'contracts' },
    { href: '/admin/invoices', label: 'Invoices', icon: 'invoices' },
    { href: '/admin/payments', label: 'Payments', icon: 'payments' },
  ] },
  { title: 'Delivery', items: [
    { href: '/admin/files', label: 'Files', icon: 'files' },
    { href: '/admin/messages', label: 'Messages', icon: 'messages', badgeKey: 'messages' },
    { href: '/admin/requests', label: 'Support requests', icon: 'requests' },
    { href: '/admin/seo', label: 'SEO reports', icon: 'seo' },
    { href: '/admin/announcements', label: 'Announcements', icon: 'announcements' },
  ] },
  { title: 'Studio', items: [
    { href: '/admin/team', label: 'Team', icon: 'team' },
    { href: '/admin/activity', label: 'Activity log', icon: 'activity' },
    { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  ] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await requireStaff();
  return (
    <AppShell mode="admin" home="/admin" nav={NAV} user={{ id: v.userId, name: v.profile.full_name || v.email, email: v.email, role: v.profile.role }}>
      {children}
    </AppShell>
  );
}
