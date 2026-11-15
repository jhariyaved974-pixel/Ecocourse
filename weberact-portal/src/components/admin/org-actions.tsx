'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Power, Trash2 } from 'lucide-react';
import { deleteOrganization, setOrganizationStatus } from '@/lib/actions/admin';
import { Button, Field, Input } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useAction } from './use-action';

export function OrgActions({ id, name, status, isAdmin }: { id: string; name: string; status: 'active' | 'inactive'; isAdmin: boolean }) {
  const router = useRouter();
  const { busy, run } = useAction();
  const [del, setDel] = useState(false); const [confirmName, setConfirmName] = useState(''); const [deleting, setDeleting] = useState(false);
  async function remove() {
    setDeleting(true);
    const r = await deleteOrganization(id, confirmName);
    setDeleting(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Deleted'); router.push('/admin/clients');
  }
  return (
    <>
      <Button variant="secondary" href={`/api/reports/${id}`} external><FileText className="h-4 w-4" /> Client report</Button>
      <Button variant={status === 'active' ? 'secondary' : 'primary'} loading={busy === 'st'}
        onClick={() => (status === 'active' ? confirm(`Deactivate ${name}? Their people lose access to the portal until you reactivate.`) : true) && run('st', () => setOrganizationStatus(id, status === 'active' ? 'inactive' : 'active'))}>
        <Power className="h-4 w-4" /> {status === 'active' ? 'Deactivate' : 'Reactivate'}
      </Button>
      {isAdmin && <Button variant="danger" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Delete</Button>}
      <Modal open={del} onClose={() => setDel(false)} size="sm" title="Delete client permanently?" description="Projects, files, contracts, messages and reports of this client are deleted. Clients with issued invoices cannot be deleted; deactivate them instead."
        footer={<><Button variant="ghost" onClick={() => setDel(false)}>Cancel</Button><Button variant="danger" loading={deleting} disabled={confirmName !== name} onClick={remove}>Delete forever</Button></>}>
        <Field label={<>Type <span className="text-fg">{name}</span> to confirm</>} htmlFor="del-name"><Input id="del-name" value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" /></Field>
      </Modal>
    </>
  );
}
