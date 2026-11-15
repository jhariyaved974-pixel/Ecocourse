import { requireClient } from '@/lib/auth';
import { AppShell, type NavGroup } from '@/components/shell/app-shell';

const NAV: NavGroup[] = [
  { items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/projects', label: 'Projects', icon: 'projects' },
    { href: '/onboarding', label: 'Onboarding', icon: 'onboarding' },
  ] },
  { title: 'Documents', items: [
    { href: '/contracts', label: 'Contracts', icon: 'contracts' },
    { href: '/billing', label: 'Billing', icon: 'billing' },
    { href: '/files', label: 'Files & deliverables', icon: 'files' },
  ] },
  { title: 'Together', items: [
    { href: '/messages', label: 'Messages', icon: 'messages', badgeKey: 'messages' },
    { href: '/requests', label: 'Requests & feedback', icon: 'requests' },
    { href: '/seo', label: 'SEO & performance', icon: 'seo' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ] },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const v = await requireClient();
  return (
    <AppShell mode="client" home="/dashboard" nav={NAV} orgName={v.organization.name}
      user={{ id: v.userId, name: v.profile.full_name || v.email, email: v.email, role: 'client' }}>
      {children}
    </AppShell>
  );
}
