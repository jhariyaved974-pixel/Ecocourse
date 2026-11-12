'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, CloudOff, Loader2, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { COUNTRIES, ONBOARDING_SERVICES } from '@/lib/constants';
import type { OnboardingAsset, OnboardingData } from '@/lib/types';
import { ago, bytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Dropzone, FileButtons, type Uploaded } from './files';

const STEPS = ['Personal information', 'Services', 'Project brief', 'Brand assets', 'Confirmation'] as const;
const CATEGORIES = ['Logo', 'Brand guidelines', 'Images', 'Documents', 'Other'] as const;

const schema = z.object({
  personal: z.object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(120),
    company: z.string().trim().min(2, 'Enter your company name').max(160),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/, 'Use digits, spaces and + only'),
    country: z.string().min(1, 'Choose a country'),
    website: z.string().trim().max(300).refine(v => !v || /^(https?:\/\/)?[\w-]+(\.[\w-]+)+.*$/.test(v), 'Enter a website like company.com'),
  }),
  services: z.object({ selected: z.array(z.string()).min(1, 'Choose at least one service'), custom: z.string().trim().max(1000) })
    .refine(s => !s.selected.includes('custom') || s.custom.length >= 5, { path: ['custom'], message: 'Describe the custom service you need' }),
  brief: z.object({
    business: z.string().trim().min(20, 'A couple of sentences about the business, please').max(3000),
    objectives: z.string().trim().min(10, 'What should this project achieve?').max(3000),
    audience: z.string().trim().min(5, 'Who are your customers?').max(2000),
    competitors: z.string().trim().max(2000), features: z.string().trim().max(3000), references: z.string().trim().max(2000), special: z.string().trim().max(3000),
  }),
  assets: z.object({ notes: z.string().trim().max(2000) }),
  confirm: z.object({ agreed: z.boolean() }),
});
type Values = z.infer<typeof schema>;
const stepFields: FieldPath<Values>[][] = [['personal'], ['services', 'services.selected', 'services.custom'], ['brief'], ['assets'], ['confirm']];

export function OnboardingWizard({ orgId, initial, defaults }: {
  orgId: string; initial: { id: string; current_step: number; data: OnboardingData; updated_at: string } | null;
  defaults: { full_name: string; email: string; company: string; phone: string; country: string; website: string };
}) {
  const router = useRouter();
  const d = initial?.data ?? {};
  const [step, setStep] = useState(Math.min(Math.max(initial?.current_step ?? 1, 1), 5) - 1);
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [assets, setAssets] = useState<OnboardingAsset[]>(d.assets?.files ?? []);
  const [category, setCategory] = useState<string>('Logo');
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; at?: string }>({ state: initial ? 'saved' : 'idle', at: initial?.updated_at });
  const [submitted, setSubmitted] = useState(false);
  const [dir, setDir] = useState(1);

  const form = useForm<Values>({
    resolver: zodResolver(schema), mode: 'onTouched',
    defaultValues: {
      personal: { ...defaults, ...d.personal } as Values['personal'],
      services: { selected: d.services?.selected ?? [], custom: d.services?.custom ?? '' },
      brief: { business: '', objectives: '', audience: '', competitors: '', features: '', references: '', special: '', ...d.brief },
      assets: { notes: d.assets?.notes ?? '' },
      confirm: { agreed: false },
    },
  });
  const { register, watch, trigger, getValues, setValue, formState: { errors } } = form;

  // ---- autosave: every change is saved to the draft a moment after typing stops
  const idRef = useRef(id), stepRef = useRef(step), assetsRef = useRef(assets), timer = useRef<ReturnType<typeof setTimeout> | null>(null), saving = useRef<Promise<void> | null>(null);
  idRef.current = id; stepRef.current = step; assetsRef.current = assets;
  const persist = useCallback(async (extra?: { status?: 'submitted' }) => {
    if (saving.current) await saving.current;
    const run = (async () => {
      setSave(s => ({ ...s, state: 'saving' }));
      const v = getValues();
      const data: OnboardingData = { personal: v.personal, services: v.services, brief: v.brief, assets: { notes: v.assets.notes, files: assetsRef.current }, confirm: v.confirm };
      const sb = supabaseBrowser();
      const row = { data, current_step: stepRef.current + 1, ...(extra ?? {}) };
      const res = idRef.current
        ? await sb.from('onboarding_submissions').update(row).eq('id', idRef.current).select('id,updated_at').single()
        : await sb.from('onboarding_submissions').insert({ ...row, organization_id: orgId }).select('id,updated_at').single();
      if (res.error) { setSave({ state: 'error' }); throw new Error(res.error.message); }
      if (!idRef.current) { setId(res.data.id); idRef.current = res.data.id; }
      setSave({ state: 'saved', at: res.data.updated_at });
    })();
    saving.current = run.catch(() => undefined).then(() => { saving.current = null; });
    return run;
  }, [getValues, orgId]);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { persist().catch(() => undefined); }, 900);
  }, [persist]);
  useEffect(() => { const sub = watch(() => schedule()); return () => sub.unsubscribe(); }, [watch, schedule]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) { if (!(await trigger(stepFields[s]!))) { toast.error('Please complete the highlighted fields.'); return; } }
    }
    setDir(to > step ? 1 : -1); setStep(to); stepRef.current = to;
    persist().catch(() => undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function submit() {
    const okAll = await trigger(); if (!okAll) { toast.error('Some answers are missing. Check each step.'); return; }
    if (!getValues('confirm.agreed')) { toast.error('Please confirm the details are correct.'); return; }
    try { if (timer.current) clearTimeout(timer.current); await persist({ status: 'submitted' }); setSubmitted(true); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function onUploaded(files: Uploaded[]) {
    const sb = supabaseBrowser();
    const { data: me } = await sb.auth.getUser();
    const { data, error } = await sb.from('project_files').insert(files.map(f => ({
      organization_id: orgId, kind: 'client_upload', folder: 'Brand assets', name: f.name, description: `${category} (onboarding)`,
      storage_path: f.path, size_bytes: f.size, mime_type: f.type, uploaded_by: me.user?.id,
    }))).select('id,name,size_bytes,storage_path');
    if (error) throw new Error(error.message);
    const next = [...assetsRef.current, ...(data ?? []).map((r: { id: string; name: string; size_bytes: number; storage_path: string }) => ({ id: r.id, name: r.name, category, size: r.size_bytes, path: r.storage_path }))];
    setAssets(next); assetsRef.current = next; schedule();
    toast.success(files.length === 1 ? 'File added' : `${files.length} files added`);
  }

  const selected = watch('services.selected');
  const v = watch();
  if (submitted) return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-2xl p-10 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-coral-500/10 text-coral-400"><CheckCircle2 className="h-8 w-8" /></div>
      <h2 className="text-2xl font-semibold tracking-tight">Onboarding submitted</h2>
      <p className="mx-auto mt-3 max-w-md text-fg-muted">Thank you. Your project team has everything it needs to start, and will reach out within one working day.</p>
      <Button href="/dashboard" className="mt-8">Back to dashboard</Button>
    </motion.div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible">
          {STEPS.map((s, i) => (
            <li key={s} className="shrink-0">
              <button onClick={() => go(i)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition', i === step ? 'bg-white/[0.06] text-fg' : 'text-fg-muted hover:bg-white/[0.03]')}
                aria-current={i === step ? 'step' : undefined}>
                <span className={cn('num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold transition',
                  i < step ? 'border-coral-500 bg-coral-500 text-ink-950' : i === step ? 'border-coral-500 text-coral-400' : 'border-line-strong text-fg-faint')}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-4 hidden items-center gap-2 px-3 text-[12px] text-fg-faint lg:flex" aria-live="polite">
          {save.state === 'saving' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : save.state === 'error' ? <><CloudOff className="h-3.5 w-3.5 text-bad" /> Not saved, check your connection</> : save.state === 'saved' ? <><Cloud className="h-3.5 w-3.5 text-ok" /> Saved {ago(save.at)}</> : 'Progress saves automatically'}
        </p>
      </aside>

      <div className="card overflow-hidden">
        <div className="h-1 bg-white/[0.04]"><motion.div className="h-full bg-gradient-to-r from-coral-600 to-coral-300" animate={{ width: `${((step + 1) / 5) * 100}%` }} transition={{ duration: 0.5 }} /></div>
        <div className="p-6 md:p-9">
          <p className="eyebrow mb-2">Step {step + 1} of 5</p>
          <h2 className="mb-7 text-[22px] font-semibold tracking-tight">{STEPS[step]}</h2>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              {step === 0 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="p-name" error={errors.personal?.full_name?.message} required><Input id="p-name" autoComplete="name" {...register('personal.full_name')} aria-invalid={!!errors.personal?.full_name} /></Field>
                  <Field label="Company name" htmlFor="p-co" error={errors.personal?.company?.message} required><Input id="p-co" autoComplete="organization" {...register('personal.company')} aria-invalid={!!errors.personal?.company} /></Field>
                  <Field label="Email" htmlFor="p-email" error={errors.personal?.email?.message} required><Input id="p-email" type="email" autoComplete="email" {...register('personal.email')} aria-invalid={!!errors.personal?.email} /></Field>
                  <Field label="Phone" htmlFor="p-phone" error={errors.personal?.phone?.message} hint="With country code"><Input id="p-phone" type="tel" autoComplete="tel" {...register('personal.phone')} /></Field>
                  <Field label="Country" htmlFor="p-country" error={errors.personal?.country?.message} required>
                    <Select id="p-country" {...register('personal.country')}><option value="">Choose a country</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</Select>
                  </Field>
                  <Field label="Business website" htmlFor="p-web" error={errors.personal?.website?.message} hint="If you have one"><Input id="p-web" inputMode="url" placeholder="company.com" {...register('personal.website')} /></Field>
                </div>
              )}
              {step === 1 && (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ONBOARDING_SERVICES.map(s => {
                      const on = selected.includes(s.value);
                      return (
                        <button type="button" key={s.value} aria-pressed={on}
                          onClick={() => setValue('services.selected', on ? selected.filter(x => x !== s.value) : [...selected, s.value], { shouldDirty: true, shouldValidate: true })}
                          className={cn('group relative rounded-2xl border p-5 text-left transition', on ? 'border-coral-500/60 bg-coral-500/[0.07]' : 'border-line bg-white/[0.015] hover:border-line-strong')}>
                          <span className={cn('absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-md border transition', on ? 'border-coral-500 bg-coral-500 text-ink-950' : 'border-line-strong')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                          <p className="font-semibold">{s.label}</p>
                          <p className="mt-1 pr-6 text-[13px] text-fg-muted">{s.text}</p>
                        </button>
                      );
                    })}
                  </div>
                  {errors.services?.selected && <p className="mt-3 text-[12.5px] text-bad" role="alert">{errors.services.selected.message}</p>}
                  {selected.includes('custom') && (
                    <Field label="Describe the custom service" htmlFor="s-custom" error={errors.services?.custom?.message} className="mt-5"><Textarea id="s-custom" rows={3} {...register('services.custom')} /></Field>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="grid gap-5">
                  <Field label="Business description" htmlFor="b-bus" error={errors.brief?.business?.message} required hint="What you sell, to whom, and what makes you different."><Textarea id="b-bus" rows={4} {...register('brief.business')} aria-invalid={!!errors.brief?.business} /></Field>
                  <Field label="Project objectives" htmlFor="b-obj" error={errors.brief?.objectives?.message} required hint="The result this project must deliver, ideally as a number."><Textarea id="b-obj" rows={3} {...register('brief.objectives')} aria-invalid={!!errors.brief?.objectives} /></Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Target audience" htmlFor="b-aud" error={errors.brief?.audience?.message} required><Textarea id="b-aud" rows={3} {...register('brief.audience')} aria-invalid={!!errors.brief?.audience} /></Field>
                    <Field label="Competitors" htmlFor="b-comp" hint="Names or websites"><Textarea id="b-comp" rows={3} {...register('brief.competitors')} /></Field>
                  </div>
                  <Field label="Required features" htmlFor="b-feat" hint="Pages, integrations, automations, languages…"><Textarea id="b-feat" rows={3} {...register('brief.features')} /></Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Design references" htmlFor="b-ref" hint="Sites or brands you like, and why"><Textarea id="b-ref" rows={3} {...register('brief.references')} /></Field>
                    <Field label="Special requirements" htmlFor="b-spec" hint="Deadlines, compliance, accessibility…"><Textarea id="b-spec" rows={3} {...register('brief.special')} /></Field>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-fg-muted">Uploading as</span>
                    {CATEGORIES.map(c => (
                      <button type="button" key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
                        className={cn('rounded-full border px-3 py-1 text-[12.5px] transition', category === c ? 'border-coral-500/60 bg-coral-500/10 text-coral-300' : 'border-line-strong text-fg-muted hover:text-fg')}>{c}</button>
                    ))}
                  </div>
                  <Dropzone prefix={`${orgId}/uploads/onboarding`} onUploaded={onUploaded} hint="Logo files (SVG or PNG), brand guidelines, photos, documents · up to 50 MB each" />
                  {assets.length > 0 && (
                    <ul className="divide-y divide-line rounded-2xl border border-line">
                      {assets.map(a => (
                        <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11.5px] text-fg-muted">{a.category}</span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px]">{a.name}</span>
                          <span className="text-[12px] text-fg-faint">{bytes(a.size)}</span>
                          {a.path && <FileButtons path={a.path} name={a.name} />}
                          <button type="button" onClick={() => { const n = assets.filter(x => x.id !== a.id); setAssets(n); assetsRef.current = n; schedule(); }}
                            className="rounded-lg p-2 text-fg-faint hover:bg-white/5 hover:text-bad" aria-label={`Remove ${a.name} from onboarding`}><Trash2 className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Field label="Anything about these files?" htmlFor="a-notes" hint="Optional. Fonts, colour codes, where to find more."><Textarea id="a-notes" rows={3} {...register('assets.notes')} /></Field>
                </div>
              )}
              {step === 4 && (
                <div className="space-y-5">
                  {[
                    ['Personal information', 0, [['Name', v.personal.full_name], ['Company', v.personal.company], ['Email', v.personal.email], ['Phone', v.personal.phone], ['Country', v.personal.country], ['Website', v.personal.website]]],
                    ['Services', 1, [['Selected', v.services.selected.map(s => ONBOARDING_SERVICES.find(o => o.value === s)?.label).join(', ')], ...(v.services.selected.includes('custom') ? [['Custom', v.services.custom]] : [])]],
                    ['Project brief', 2, [['Business', v.brief.business], ['Objectives', v.brief.objectives], ['Audience', v.brief.audience], ['Competitors', v.brief.competitors], ['Features', v.brief.features], ['References', v.brief.references], ['Special requirements', v.brief.special]]],
                    ['Brand assets', 3, [['Files', assets.length ? assets.map(a => `${a.name} (${a.category})`).join(', ') : 'None yet'], ['Notes', v.assets.notes]]],
                  ].map(([title, idx, rows]) => (
                    <section key={title as string} className="rounded-2xl border border-line">
                      <div className="flex items-center justify-between border-b border-line px-5 py-3">
                        <h3 className="text-[14px] font-semibold">{title as string}</h3>
                        <button type="button" onClick={() => go(idx as number)} className="text-[12.5px] text-coral-400 hover:text-coral-300">Edit</button>
                      </div>
                      <dl className="divide-y divide-line/60 px-5">
                        {(rows as string[][]).map(([k, val]) => (
                          <div key={k} className="grid gap-1 py-2.5 text-[13.5px] sm:grid-cols-[170px_1fr]"><dt className="text-fg-muted">{k}</dt><dd className="whitespace-pre-line text-fg-soft">{val || <span className="text-fg-faint">Not provided</span>}</dd></div>
                        ))}
                      </dl>
                    </section>
                  ))}
                  <Checkbox {...register('confirm.agreed')} label="I confirm these details are correct and WeberAct may use them, and the files I uploaded, to plan and deliver this project." />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-9 flex items-center justify-between gap-3 border-t border-line pt-6">
            <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}><ArrowLeft className="h-4 w-4" /> Back</Button>
            {step < 4
              ? <Button onClick={() => go(step + 1)}>Continue <ArrowRight className="h-4 w-4" /></Button>
              : <Button onClick={submit} loading={save.state === 'saving'}>Submit onboarding <Check className="h-4 w-4" /></Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
