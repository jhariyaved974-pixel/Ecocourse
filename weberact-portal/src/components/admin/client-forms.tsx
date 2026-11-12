'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createClientAccount, updateOrganization } from '@/lib/actions/admin';
import { COUNTRIES, CURRENCIES } from '@/lib/constants';
import type { Organization } from '@/lib/types';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';

export const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(160), legal_name: z.string().max(200), website: z.string().max(300), country: z.string().max(80),
  industry: z.string().max(120), tax_id: z.string().max(40), billing_address: z.string().max(500), currency: z.enum(CURRENCIES),
  gsc_site_url: z.string().max(300), ga4_property_id: z.string().regex(/^(\d{4,20})?$/, 'Numbers only'), notes: z.string().max(4000),
});
type OrgValues = z.infer<typeof orgSchema>;
const emptyOrg: OrgValues = { name: '', legal_name: '', website: '', country: '', industry: '', tax_id: '', billing_address: '', currency: 'USD', gsc_site_url: '', ga4_property_id: '', notes: '' };
const newSchema = orgSchema.extend({ contact_name: z.string().trim().min(2, 'Enter the contact name'), contact_email: z.string().trim().email('Enter a valid email'), contact_phone: z.string().max(40), contact_title: z.string().max(120), invite: z.boolean() });

export function NewClientButton({ serviceKey }: { serviceKey: boolean }) {
  const router = useRouter(); const params = useSearchParams();
  const [open, setOpen] = useState(() => Boolean(params.get('new')));
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof newSchema>>({
    resolver: zodResolver(newSchema), defaultValues: { ...emptyOrg, contact_name: '', contact_email: '', contact_phone: '', contact_title: '', invite: serviceKey },
  });
  async function submit(d: z.infer<typeof newSchema>) {
    const { contact_name, contact_email, contact_phone, contact_title, invite, ...org } = d;
    const r = await createClientAccount({ org, contact: { full_name: contact_name, email: contact_email, phone: contact_phone, job_title: contact_title }, sendInvite: invite });
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Client created'); reset(); setOpen(false); router.push(`/admin/clients/${r.data!.id}`);
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New client</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="New client" description="The company and its first contact. The contact can then sign in to the portal."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={handleSubmit(submit)} loading={isSubmitting}>Create client</Button></>}>
        <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
          <OrgFields register={register} errors={errors} compact />
          <div>
            <p className="eyebrow mb-3">Primary contact</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="c-name" error={errors.contact_name?.message} required><Input id="c-name" {...register('contact_name')} /></Field>
              <Field label="Email" htmlFor="c-email" error={errors.contact_email?.message} required hint="Their sign-in email"><Input id="c-email" type="email" {...register('contact_email')} /></Field>
              <Field label="Phone" htmlFor="c-phone"><Input id="c-phone" {...register('contact_phone')} /></Field>
              <Field label="Job title" htmlFor="c-title"><Input id="c-title" {...register('contact_title')} /></Field>
            </div>
            <Checkbox className="mt-4" {...register('invite')} label={serviceKey ? 'Email them an invitation to set up their account now' : 'Send an invitation (needs SUPABASE_SECRET_KEY; until then they sign in with an email link)'} disabled={!serviceKey} />
          </div>
        </form>
      </Modal>
    </>
  );
}

type Reg = ReturnType<typeof useForm<OrgValues>>['register'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OrgFields({ register, errors, compact }: { register: any; errors: any; compact?: boolean }) {
  const r = register as Reg;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" htmlFor="o-name" error={errors.name?.message} required><Input id="o-name" {...r('name')} /></Field>
      <Field label="Legal name" htmlFor="o-legal" hint="For invoices and contracts"><Input id="o-legal" {...r('legal_name')} /></Field>
      <Field label="Website" htmlFor="o-web"><Input id="o-web" placeholder="https://" {...r('website')} /></Field>
      <Field label="Country" htmlFor="o-country"><Select id="o-country" {...r('country')}><option value="">Choose</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Billing currency" htmlFor="o-cur"><Select id="o-cur" {...r('currency')}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Tax ID / GSTIN" htmlFor="o-tax"><Input id="o-tax" {...r('tax_id')} /></Field>
      {!compact && <>
        <Field label="Industry" htmlFor="o-ind"><Input id="o-ind" {...r('industry')} /></Field>
        <Field label="Search Console property" htmlFor="o-gsc" hint="e.g. sc-domain:example.com"><Input id="o-gsc" {...r('gsc_site_url')} /></Field>
        <Field label="GA4 property ID" htmlFor="o-ga4" error={errors.ga4_property_id?.message} hint="Numbers only"><Input id="o-ga4" inputMode="numeric" {...r('ga4_property_id')} /></Field>
      </>}
      <Field label="Billing address" htmlFor="o-addr" className="sm:col-span-2"><Textarea id="o-addr" rows={2} {...r('billing_address')} /></Field>
      {!compact && <Field label="Internal notes" htmlFor="o-notes" className="sm:col-span-2" hint="Only WeberAct sees these"><Textarea id="o-notes" rows={3} {...r('notes')} /></Field>}
    </div>
  );
}

export function EditOrganizationForm({ org }: { org: Organization }) {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, reset } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: Object.fromEntries(Object.keys(emptyOrg).map(k => [k, (org as unknown as Record<string, unknown>)[k] ?? (k === 'currency' ? 'USD' : '')])) as OrgValues,
  });
  async function submit(d: OrgValues) {
    const r = await updateOrganization(org.id, d);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Saved'); reset(d); router.refresh();
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
      <OrgFields register={register} errors={errors} />
      <div className="flex justify-end"><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save details</Button></div>
    </form>
  );
}
