'use client';
import { useState } from 'react';
import { Pencil, Plus, Trash2, UserCheck, UserMinus } from 'lucide-react';
import { removeTeamMember, saveTeamMember, setTeamActive } from '@/lib/actions/admin';
import type { TeamMember } from '@/lib/types';
import { Avatar, Badge, Button, Checkbox, EmptyState, Field, Input, Select } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function TeamManager({ team, canEdit, serviceKey, projectCounts }: { team: TeamMember[]; canEdit: boolean; serviceKey: boolean; projectCounts: Record<string, number> }) {
  const { busy, run } = useAction();
  const [edit, setEdit] = useState<TeamMember | 'new' | null>(null);
  const [f, setF] = useState({ full_name: '', email: '', title: '', role: 'manager' as 'admin' | 'manager', invite: serviceKey });
  const open = (m: TeamMember | 'new') => { setEdit(m); setF(m === 'new' ? { full_name: '', email: '', title: '', role: 'manager', invite: serviceKey } : { full_name: m.full_name, email: m.email, title: m.title ?? '', role: m.role, invite: false }); };
  return (
    <div className="card overflow-hidden">
      {canEdit && <div className="flex justify-end border-b border-line p-4"><Button onClick={() => open('new')}><Plus className="h-4 w-4" /> Add team member</Button></div>}
      {team.length === 0 ? <EmptyState title="No team members yet" body="Add project managers so clients see who looks after them." /> : (
        <ul className="divide-y divide-line">{team.map(m => (
          <li key={m.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
            <Avatar name={m.full_name} size={40} />
            <div className="min-w-0 flex-1"><p className="text-[14.5px] font-medium">{m.full_name}</p><p className="truncate text-[12.5px] text-fg-faint">{m.title ?? 'Team member'} · {m.email}</p></div>
            <span className="text-[12.5px] text-fg-muted">{projectCounts[m.id] ?? 0} projects</span>
            <Badge tone={m.role === 'admin' ? 'coral' : 'neutral'}>{m.role === 'admin' ? 'Admin' : 'Project manager'}</Badge>
            {!m.is_active ? <Badge>No access</Badge> : m.user_id ? <Badge tone="ok">Active</Badge> : <Badge tone="info">Invited</Badge>}
            {canEdit && <div className="flex">
              <button onClick={() => open(m)} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-fg" aria-label={`Edit ${m.full_name}`}><Pencil className="h-4 w-4" /></button>
              <button onClick={() => run('a' + m.id, () => setTeamActive(m.id, !m.is_active))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-fg" aria-label={m.is_active ? `Remove access for ${m.full_name}` : `Restore access for ${m.full_name}`}>{m.is_active ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</button>
              <button onClick={() => confirm(`Remove ${m.full_name} from the team?`) && run('r' + m.id, () => removeTeamMember(m.id))} className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-bad" aria-label={`Remove ${m.full_name}`}><Trash2 className="h-4 w-4" /></button>
            </div>}
          </li>
        ))}</ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'Add team member' : 'Edit team member'} size="sm"
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy === 'save'} onClick={() => run('save', () => saveTeamMember(edit === 'new' ? null : (edit as TeamMember).id, f, f.invite), { onOk: () => setEdit(null) })}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Full name" htmlFor="tm-name"><Input id="tm-name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="tm-email" hint={edit !== 'new' ? 'The sign-in email cannot change.' : 'Their sign-in email'}><Input id="tm-email" type="email" value={f.email} disabled={edit !== 'new'} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Title" htmlFor="tm-title"><Input id="tm-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Project manager" /></Field>
          <Field label="Access" htmlFor="tm-role" hint="Admins also manage money, the team and settings."><Select id="tm-role" value={f.role} onChange={e => setF({ ...f, role: e.target.value as 'admin' })}><option value="manager">Project manager</option><option value="admin">Admin</option></Select></Field>
          {edit === 'new' && <Checkbox checked={f.invite} disabled={!serviceKey} onChange={e => setF({ ...f, invite: e.target.checked })} label={serviceKey ? 'Email an invitation now' : 'Invites need SUPABASE_SECRET_KEY; they can sign in with an email link'} />}
        </div>
      </Modal>
    </div>
  );
}
