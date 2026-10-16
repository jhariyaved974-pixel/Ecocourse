'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { dbErrorMessage, fail, ok, zodFieldErrors, type ActionResult } from '@/lib/errors';
import { INDIAN_STATES, MOBILE, PIN_CODE, normalizeMobile } from '@/lib/india';
import { rateLimit } from '@/lib/security';

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  return user;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(120),
  phone: z.string().trim().refine((v) => v === '' || MOBILE.test(v), 'Enter a valid 10-digit mobile number.'),
  marketing: z.boolean(),
  cartReminders: z.boolean().nullable(),
});

export async function updateProfile(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone') ?? '',
    marketing: formData.get('marketing') === 'on',
    // Only change the reminder choice when the form actually showed it.
    cartReminders: formData.get('cartRemindersShown') === '1' ? formData.get('cartReminders') === 'on' : null,
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ? normalizeMobile(parsed.data.phone) : null,
      marketing_opt_in: parsed.data.marketing,
      ...(parsed.data.cartReminders === null ? {} : { cart_reminder_opt_in: parsed.data.cartReminders }),
    })
    .eq('id', user.id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath('/account');
  return ok(null, 'Profile saved.');
}

const addressSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(30).default('Home'),
  fullName: z.string().trim().min(2, 'Enter the recipient’s name.').max(120),
  phone: z.string().trim().regex(MOBILE, 'Enter a valid 10-digit mobile number.'),
  line1: z.string().trim().min(3, 'Enter the house number and street.').max(200),
  line2: z.string().trim().max(200),
  landmark: z.string().trim().max(120),
  city: z.string().trim().min(2, 'Enter the city.').max(80),
  state: z.string().refine((v) => (INDIAN_STATES as readonly string[]).includes(v), 'Choose a state.'),
  postalCode: z.string().trim().regex(PIN_CODE, 'Enter a valid 6-digit PIN code.'),
  isDefault: z.boolean(),
});

export async function saveAddress(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = addressSchema.safeParse({
    id: formData.get('id') || undefined,
    label: formData.get('label') || 'Home',
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    line1: formData.get('line1'),
    line2: formData.get('line2') ?? '',
    landmark: formData.get('landmark') ?? '',
    city: formData.get('city'),
    state: formData.get('state'),
    postalCode: formData.get('postalCode'),
    isDefault: formData.get('isDefault') === 'on',
  });
  if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
  const a = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (a.isDefault) await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id).eq('is_default', true);
  const row = {
    user_id: user.id,
    label: a.label,
    full_name: a.fullName,
    phone: normalizeMobile(a.phone),
    line1: a.line1,
    line2: a.line2 || null,
    landmark: a.landmark || null,
    city: a.city,
    state: a.state,
    postal_code: a.postalCode,
    is_default: a.isDefault,
  };
  if (!a.id) {
    const { count } = await supabase.from('addresses').select('id', { count: 'exact', head: true });
    if ((count ?? 0) >= 10) return fail('You can save up to 10 addresses.');
  }
  const { error } = a.id ? await supabase.from('addresses').update(row).eq('id', a.id) : await supabase.from('addresses').insert(row);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath('/account/addresses');
  return ok(null, 'Address saved.');
}

export async function deleteAddress(id: string): Promise<ActionResult<null>> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return fail('Invalid address.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) return fail(dbErrorMessage(error));
  revalidatePath('/account/addresses');
  return ok(null, 'Address removed.');
}

const requestSchema = z.object({
  type: z.enum(['data_export', 'account_deletion', 'order_issue', 'other']),
  message: z.string().trim().min(5, 'Tell us a little more (at least 5 characters).').max(2000),
});

export async function createCustomerRequest(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse({ type: formData.get('type'), message: formData.get('message') });
  if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
  if (!(await rateLimit('customer-request', user.id, 5, 86400))) return fail('You have sent several requests today. We will get back to you soon.');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('customer_requests').insert({
    user_id: user.id,
    email: user.email ?? '',
    request_type: parsed.data.type,
    message: parsed.data.message,
  });
  if (error) return fail(dbErrorMessage(error));
  revalidatePath('/account/requests');
  return ok(null, 'Request sent. We usually reply within 2 business days.');
}
