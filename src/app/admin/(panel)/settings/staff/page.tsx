import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Panel, Table, TableWrap, Td, Th } from '@/components/admin/ui';
import { AddStaffForm, MyTwoFactor, SecuritySettingsForm, StaffRowControls, type StaffRow } from '@/components/admin/settings/staff-manager';
import { Badge } from '@/components/ui/misc';
import { formatDate, titleCase } from '@/lib/utils';

export const metadata: Metadata = { title: 'Staff & security' };

export default async function StaffPage() {
  const staff = await requireStaffPage(ROLE_GROUPS.admin);
  const isOwner = staff.role === 'owner';
  const supabase = await createSupabaseServerClient();
  const [{ data: members }, { data: security }] = await Promise.all([
    supabase.from('staff_members').select('user_id, role, is_active, created_at').order('created_at'),
    supabase.from('security_settings').select('require_staff_mfa, staff_session_hours').maybeSingle(),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, email, full_name').in('id', ids) : { data: [] };
  const rows: StaffRow[] = (members ?? []).map((m) => {
    const p = profiles?.find((x) => x.id === m.user_id);
    return { userId: m.user_id, email: p?.email ?? '(unknown)', name: p?.full_name ?? null, role: m.role, active: m.is_active, createdAt: m.created_at };
  });
  return (
    <>
      <PageHeader title="Staff & security" description="Admin access is granted here only — never through sign-up. Every change is recorded in the audit log." />
      <div className="space-y-6">
        <Panel title="Add staff">
          <AddStaffForm canGrantAdmin={isOwner} />
        </Panel>
        <Panel title={`Team (${rows.length})`}>
          <TableWrap className="border-0">
            <Table>
              <thead><tr><Th>Person</Th><Th>Role</Th><Th>Status</Th><Th>Added</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <Td><span className="font-medium">{r.name || r.email}</span>{r.name ? <span className="block text-xs text-muted">{r.email}</span> : null}</Td>
                    <Td>{titleCase(r.role)}</Td>
                    <Td>{r.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}</Td>
                    <Td className="text-muted">{formatDate(r.createdAt)}</Td>
                    <Td><StaffRowControls row={r} me={staff.user.id} canManage={isOwner || (r.role !== 'owner' && r.role !== 'admin')} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Panel>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <Panel title="Security policy">
            <SecuritySettingsForm isOwner={isOwner} initial={{ requireMfa: security?.require_staff_mfa ?? false, sessionHours: security?.staff_session_hours ?? 12 }} />
          </Panel>
          <Panel title="Your two-factor authentication">
            <MyTwoFactor />
          </Panel>
        </div>
      </div>
    </>
  );
}
