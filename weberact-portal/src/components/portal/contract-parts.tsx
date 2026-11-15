'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button, Checkbox, Field, Input } from '@/components/ui/primitives';

export function ContractPreview({ id, hasFile }: { id: string; hasFile: boolean }) {
  const src = `/api/contracts/${id}/pdf`;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <p className="text-[14px] font-semibold">{hasFile ? 'Contract document' : 'Contract summary (PDF)'}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" href={src} external><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
          <Button size="sm" variant="secondary" href={`${src}?download=1`} external><Download className="h-3.5 w-3.5" /> Download</Button>
        </div>
      </div>
      <iframe src={src} title="Contract preview" className="h-[640px] w-full bg-white" />
    </div>
  );
}

export function AcceptContract({ id, defaultName }: { id: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc('accept_contract', { p_contract: id, p_full_name: name, p_user_agent: navigator.userAgent });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Contract accepted. A record has been saved.');
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4 text-[12.5px] leading-relaxed text-fg-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-coral-400" />
        <p>By typing your full name and selecting <span className="text-fg">Accept contract</span>, you agree to this contract electronically. The portal records your name, your account email, the date and time, your IP address and browser, and a SHA-256 fingerprint of this exact document. This is an electronic acceptance record, not a certified digital signature.</p>
      </div>
      <Field label="Your full name" htmlFor="acc-name"><Input id="acc-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>
      <Checkbox checked={agree} onChange={e => setAgree(e.target.checked)} label="I have read the contract and I am authorised to accept it for my company." />
      <Button className="w-full" size="lg" onClick={accept} loading={busy} disabled={!agree || name.trim().length < 2}>Accept contract</Button>
    </div>
  );
}
