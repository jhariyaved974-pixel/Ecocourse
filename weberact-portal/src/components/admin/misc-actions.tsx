'use client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { deleteProject } from '@/lib/actions/admin';
import { Button } from '@/components/ui/primitives';

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  async function go() {
    if (!confirm(`Delete "${name}" with its stages, files and conversations? Invoices and contracts stay but lose the link.`)) return;
    const r = await deleteProject(id);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Deleted'); router.push('/admin/projects');
  }
  return <Button variant="danger" onClick={go} aria-label="Delete project"><Trash2 className="h-4 w-4" /></Button>;
}
