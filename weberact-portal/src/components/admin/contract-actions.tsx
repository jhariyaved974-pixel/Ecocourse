'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Send, Trash2, TimerOff } from 'lucide-react';
import { deleteContract, setContractStatus } from '@/lib/actions/admin';
import { Button } from '@/components/ui/primitives';
import { useAction } from './use-action';

export function ContractActions({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const { busy, run } = useAction();
  return (
    <>
      {status === 'draft' && <Button loading={busy === 'send'} onClick={() => run('send', () => setContractStatus(id, 'sent'))}><Send className="h-4 w-4" /> Send to client</Button>}
      {status === 'sent' && <Button variant="secondary" loading={busy === 'exp'} onClick={() => confirm('Mark as expired? The client can no longer accept it.') && run('exp', () => setContractStatus(id, 'expired'))}><TimerOff className="h-4 w-4" /> Expire</Button>}
      {['sent', 'accepted'].includes(status) && <Button variant="danger" loading={busy === 'void'} onClick={() => confirm('Void this contract? The record is kept.') && run('void', () => setContractStatus(id, 'void'))}><Ban className="h-4 w-4" /> Void</Button>}
      {status === 'draft' && <Button variant="danger" onClick={async () => { if (!confirm('Delete this draft?')) return; const r = await deleteContract(id); if (!r.ok) return toast.error(r.error); toast.success('Deleted'); router.push('/admin/contracts'); }} aria-label="Delete draft"><Trash2 className="h-4 w-4" /></Button>}
    </>
  );
}
