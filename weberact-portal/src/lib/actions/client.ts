'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionViewer } from '@/lib/auth';
import { fail, ok, type Result } from '@/lib/utils';

const requestSchema = z.object({
  type: z.enum(['revision', 'support', 'feedback', 'question']),
  project_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3, 'Add a short title').max(160),
  details: z.string().trim().max(6000).optional().default(''),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
export async function createRequest(input: z.input<typeof requestSchema>): Promise<Result> {
  try {
    const v = await actionViewer();
    const d = requestSchema.parse(input);
    const org = v.isStaff ? null : v.profile.organization_id;
    if (!org) return fail('Requests are raised from a client account.');
    const { error } = await v.supabase.from('support_requests').insert({ ...d, project_id: d.project_id || null, rating: d.type === 'feedback' ? d.rating ?? null : null, organization_id: org });
    if (error) return fail(error);
    revalidatePath('/requests'); revalidatePath('/dashboard');
    return ok(undefined, d.type === 'revision' ? 'Revision request sent to the team' : 'Sent to the team');
  } catch (e) { return fail(e instanceof z.ZodError ? e.issues[0]!.message : e); }
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: z.string().trim().max(40).optional().default(''),
  email_notifications: z.boolean(),
});
export async function updateProfile(input: z.input<typeof profileSchema>): Promise<Result> {
  try {
    const v = await actionViewer();
    const d = profileSchema.parse(input);
    const { error } = await v.supabase.from('profiles').update({ ...d, phone: d.phone || null }).eq('id', v.userId);
    if (error) return fail(error);
    revalidatePath('/', 'layout');
    return ok(undefined, 'Profile saved');
  } catch (e) { return fail(e instanceof z.ZodError ? e.issues[0]!.message : e); }
}

const convSchema = z.object({ subject: z.string().trim().min(2, 'Add a subject').max(160), project_id: z.string().uuid().nullable().optional(), organization_id: z.string().uuid().optional(), body: z.string().trim().min(1, 'Write a message').max(10000) });
export async function startConversation(input: z.input<typeof convSchema>): Promise<Result<{ id: string }>> {
  try {
    const v = await actionViewer();
    const d = convSchema.parse(input);
    const org = v.isStaff ? d.organization_id : v.profile.organization_id;
    if (!org) return fail('Choose a client.');
    const { data, error } = await v.supabase.from('conversations').insert({ organization_id: org, project_id: d.project_id || null, subject: d.subject, created_by: v.userId }).select('id').single();
    if (error || !data) return fail(error ?? 'Could not start the conversation');
    const m = await v.supabase.from('messages').insert({ conversation_id: data.id, body: d.body });
    if (m.error) return fail(m.error);
    revalidatePath(v.isStaff ? '/admin/messages' : '/messages');
    return ok({ id: data.id as string });
  } catch (e) { return fail(e instanceof z.ZodError ? e.issues[0]!.message : e); }
}
