'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
import { saveProject } from '@/lib/actions/admin';
import { CURRENCIES } from '@/lib/constants';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { useClientPicker } from './client-picker';

const schema = z.object({
  organization_id: z.string().uuid('Choose a client'), name: z.string().trim().min(2, 'Enter a project name').max(160), description: z.string().max(4000), scope: z.string().max(8000),
  deliverables: z.string().max(12000), manager_id: z.string(), start_date: z.string(), due_date: z.string(), value: z.string().regex(/^(\d+(\.\d{1,2})?)?$/, 'Numbers only'),
  currency: z.enum(CURRENCIES), status: z.enum(['active', 'on_hold', 'completed', 'cancelled']), service_ids: z.array(z.string()),
}).refine(p => !p.start_date || !p.due_date || p.due_date >= p.start_date, { message: 'Must be after the start date', path: ['due_date'] });
type V = z.infer<typeof schema>;
type Opts = { orgs: { id: string; name: string; currency: string }[]; services: { id: string; name: string }[]; team: { id: string; full_name: string }[]; defaultCurrency?: string };

function useProjectForm({ opts, initial, editing, onSaved }: { opts: Opts; initial: V; editing: boolean; onSaved: (id: string) => void }) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<V>({ resolver: zodResolver(schema), defaultValues: initial });
  const sel = watch('service_ids');
  const client = useClientPicker({ id: 'pj-org', orgs: opts.orgs, value: watch('organization_id'), locked: editing,
    placeholder: 'Choose a client', defaultCurrency: opts.defaultCurrency,
    onPick: o => { setValue('organization_id', o.id, { shouldValidate: true }); setValue('currency', o.currency as V['currency']); } });
  async function submit(d: V, editingId?: string) {
    const r = await saveProject(editingId ?? null, { ...d, value: d.value ? Number(d.value) : null, deliverables: d.deliverables.split('\n').map(s => s.trim()).filter(Boolean), manager_id: d.manager_id || null, start_date: d.start_date || null, due_date: d.due_date || null });
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Saved'); onSaved(r.data!.id);
  }
  return { form: (editingId?: string) => (
    <form id="project-form" onSubmit={handleSubmit(d => submit(d, editingId))} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="pj-org" error={errors.organization_id?.message} required>{client.select}</Field>
        <Field label="Project name" htmlFor="pj-name" error={errors.name?.message} required><Input id="pj-name" {...register('name')} /></Field>
      </div>
      {client.panel}
      <Field label="Services">
        <div className="flex flex-wrap gap-2">
          {opts.services.map(s => { const on = sel.includes(s.id); return (
            <button type="button" key={s.id} aria-pressed={on} onClick={() => setValue('service_ids', on ? sel.filter(x => x !== s.id) : [...sel, s.id])}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition', on ? 'border-coral-500/60 bg-coral-500/10 text-coral-300' : 'border-line-strong text-fg-muted hover:text-fg')}>{on && <Check className="h-3 w-3" />}{s.name}</button>); })}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Project manager" htmlFor="pj-mgr"><Select id="pj-mgr" {...register('manager_id')}><option value="">WeberAct team</option>{opts.team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
        <Field label="Start date" htmlFor="pj-start"><Input id="pj-start" type="date" {...register('start_date')} /></Field>
        <Field label="Expected delivery" htmlFor="pj-due" error={errors.due_date?.message}><Input id="pj-due" type="date" {...register('due_date')} /></Field>
        <Field label="Project value" htmlFor="pj-val" error={errors.value?.message}><Input id="pj-val" inputMode="decimal" {...register('value')} /></Field>
        <Field label="Currency" htmlFor="pj-cur"><Select id="pj-cur" {...register('currency')}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Status" htmlFor="pj-status"><Select id="pj-status" {...register('status')}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
      </div>
      <Field label="Description" htmlFor="pj-desc" hint="One or two sentences the client sees at the top of the project."><Textarea id="pj-desc" rows={2} {...register('description')} /></Field>
      <Field label="Scope of work" htmlFor="pj-scope"><Textarea id="pj-scope" rows={5} {...register('scope')} /></Field>
      <Field label="Deliverables" htmlFor="pj-del" hint="One per line"><Textarea id="pj-del" rows={4} {...register('deliverables')} /></Field>
    </form>
  ), isSubmitting };
}

export function ProjectFormModal({ opts, project, trigger = 'button' }: { opts: Opts; project?: Project; trigger?: 'button' | 'edit' }) {
  const router = useRouter(); const params = useSearchParams();
  const [open, setOpen] = useState(() => !project && Boolean(params.get('new')));
  const presetOrg = params.get('org') ?? '';
  const initial: V = project ? {
    organization_id: project.organization_id, name: project.name, description: project.description ?? '', scope: project.scope ?? '', deliverables: project.deliverables.join('\n'),
    manager_id: project.manager_id ?? '', start_date: project.start_date ?? '', due_date: project.due_date ?? '', value: project.value != null ? String(project.value) : '',
    currency: project.currency as V['currency'], status: project.status, service_ids: (project.project_services ?? []).map(s => s.service?.id).filter(Boolean) as string[],
  } : { organization_id: presetOrg, name: '', description: '', scope: '', deliverables: '', manager_id: '', start_date: new Date().toISOString().slice(0, 10), due_date: '', value: '',
    currency: (opts.orgs.find(o => o.id === presetOrg)?.currency ?? opts.defaultCurrency ?? 'USD') as V['currency'], status: 'active', service_ids: [] };
  const { form, isSubmitting } = useProjectForm({ opts, initial, editing: Boolean(project), onSaved: id => { setOpen(false); if (project) router.refresh(); else router.push(`/admin/projects/${id}`); } });
  return (
    <>
      {trigger === 'edit' ? <Button variant="secondary" onClick={() => setOpen(true)}>Edit project</Button> : <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New project</Button>}
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={project ? 'Edit project' : 'New project'} description={project ? undefined : 'The client is notified and sees the project at once.'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="project-form" loading={isSubmitting}>{project ? 'Save changes' : 'Create project'}</Button></>}>
        {form(project?.id)}
      </Modal>
    </>
  );
}
