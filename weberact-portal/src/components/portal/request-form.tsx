'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { createRequest } from '@/lib/actions/client';
import { REQUEST_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';

const schema = z.object({
  type: z.enum(['revision', 'support', 'feedback', 'question']),
  project_id: z.string().optional(),
  title: z.string().trim().min(3, 'Add a short title').max(160),
  details: z.string().trim().max(6000),
  priority: z.enum(['low', 'normal', 'high']),
});
type Values = z.infer<typeof schema>;

export function RequestButton({ projects, projectId, defaultType = 'revision', label = 'Request a revision', variant = 'primary' }: {
  projects: { id: string; name: string }[]; projectId?: string; defaultType?: Values['type']; label?: string; variant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New request" description="It goes straight to your project team. You will see updates here and in your notifications.">
        <RequestForm projects={projects} projectId={projectId} defaultType={defaultType} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function RequestForm({ projects, projectId, defaultType = 'revision', onDone }: { projects: { id: string; name: string }[]; projectId?: string; defaultType?: Values['type']; onDone?: () => void }) {
  const [rating, setRating] = useState(0);
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: { type: defaultType, project_id: projectId ?? projects[0]?.id ?? '', title: '', details: '', priority: 'normal' },
  });
  const type = watch('type');
  async function submit(v: Values) {
    if (v.type === 'feedback' && !rating) { toast.error('Choose a rating from 1 to 5.'); return; }
    const r = await createRequest({ ...v, project_id: v.project_id || null, rating: v.type === 'feedback' ? rating : null });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.message ?? 'Sent'); reset(); setRating(0); onDone?.();
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="rq-type"><Select id="rq-type" {...register('type')}>{REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
        <Field label="Project" htmlFor="rq-proj">
          <Select id="rq-proj" {...register('project_id')}><option value="">General</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </Field>
      </div>
      <Field label="Title" htmlFor="rq-title" error={errors.title?.message} required>
        <Input id="rq-title" placeholder={type === 'revision' ? 'e.g. Change the hero headline on the home page' : 'A short summary'} {...register('title')} aria-invalid={!!errors.title} />
      </Field>
      <Field label="Details" htmlFor="rq-details" hint="Links, page names and exact wording help the team act faster.">
        <Textarea id="rq-details" rows={5} {...register('details')} />
      </Field>
      {type === 'feedback' ? (
        <Field label="Your rating">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)} className="rounded-lg p-1.5 transition hover:bg-white/5">
                <Star className={cn('h-6 w-6 transition', n <= rating ? 'fill-coral-500 text-coral-500' : 'text-fg-faint')} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </Field>
      ) : (
        <Field label="Priority" htmlFor="rq-pri"><Select id="rq-pri" {...register('priority')}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
      )}
      <div className="flex justify-end gap-2.5 pt-2">
        {onDone && <Button variant="ghost" onClick={onDone}>Cancel</Button>}
        <Button type="submit" loading={isSubmitting}>Send request</Button>
      </div>
    </form>
  );
}
