'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowLeft, MessagesSquare, Paperclip, Plus, Search, SendHorizonal, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { startConversation } from '@/lib/actions/client';
import type { Attachment, Conversation, Message } from '@/lib/types';
import { ago, bytes, dateTime } from '@/lib/format';
import { cn, safeFileName, uid } from '@/lib/utils';
import { Avatar, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { FileButtons } from './files';

type Person = { id: string; name: string; staff: boolean };
export function MessageCenter({ conversations, unread, people, me, staff, orgs = [], projects, initialId, newForProject }: {
  conversations: Conversation[]; unread: Record<string, number>; people: Person[]; me: string; staff: boolean;
  orgs?: { id: string; name: string }[]; projects: { id: string; name: string; organization_id: string }[]; initialId?: string; newForProject?: string;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(initialId ?? (typeof window !== 'undefined' && window.innerWidth >= 1024 ? conversations[0]?.id ?? null : null));
  const [q, setQ] = useState(''); const [orgFilter, setOrgFilter] = useState('');
  const [reads, setReads] = useState(unread);
  const [composeOpen, setComposeOpen] = useState(!!newForProject);
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const list = conversations.filter(c => (!orgFilter || c.organization_id === orgFilter) && (!q || `${c.subject} ${c.organization?.name ?? ''} ${c.project?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const conv = conversations.find(c => c.id === active) ?? null;

  return (
    <div className="card grid h-[calc(100dvh-210px)] min-h-[520px] overflow-hidden lg:grid-cols-[340px_1fr]">
      <aside className={cn('flex min-h-0 flex-col border-r border-line', conv && 'hidden lg:flex')}>
        <div className="space-y-2.5 border-b border-line p-3">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-9 pl-9" aria-label="Search conversations" /></div>
            <Button size="icon" onClick={() => setComposeOpen(true)} aria-label="New conversation" title="New conversation"><Plus className="h-4 w-4" /></Button>
          </div>
          {staff && orgs.length > 1 && <Select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} className="h-9" aria-label="Client"><option value="">All clients</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <li className="px-5 py-10 text-center text-[13px] text-fg-muted">{conversations.length ? 'No conversation matches.' : 'No conversations yet.'}</li>}
          {list.map(c => {
            const n = reads[c.id] ?? 0;
            return (
              <li key={c.id}>
                <button onClick={() => setActive(c.id)} className={cn('flex w-full items-start gap-3 border-b border-line/60 px-4 py-3.5 text-left transition', c.id === active ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]')}>
                  <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', n ? 'bg-coral-500' : 'bg-transparent')} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-[13.5px]', n ? 'font-semibold text-fg' : 'text-fg-soft')}>{c.subject}</span>
                      <span className="shrink-0 text-[11px] text-fg-faint">{ago(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-fg-faint">{[staff && c.organization?.name, c.project?.name ?? 'General'].filter(Boolean).join(' · ')}</span>
                  </span>
                  {n > 0 && <span className="num mt-0.5 rounded-full bg-coral-500 px-1.5 text-[10.5px] font-semibold text-ink-950">{n}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className={cn('min-h-0', !conv && 'hidden lg:block')}>
        {conv ? <Thread key={conv.id} conv={conv} me={me} byId={byId} staff={staff} onBack={() => setActive(null)} onRead={() => setReads(r => ({ ...r, [conv.id]: 0 }))} />
          : <EmptyState className="h-full" icon={<MessagesSquare className="h-6 w-6" />} title="Choose a conversation" body={staff ? 'Messages from every client, in one place.' : 'Talk to your project team. Replies arrive here and in your notifications.'}
              action={<Button onClick={() => setComposeOpen(true)}><Plus className="h-4 w-4" /> New conversation</Button>} />}
      </section>
      <Compose open={composeOpen} onClose={() => setComposeOpen(false)} staff={staff} orgs={orgs} projects={projects} defaultProject={newForProject}
        onCreated={id => { setComposeOpen(false); setActive(id); router.refresh(); }} />
    </div>
  );
}

function Thread({ conv, me, byId, staff, onBack, onRead }: { conv: Conversation; me: string; byId: Map<string, Person>; staff: boolean; onBack: () => void; onRead: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sb = supabaseBrowser();

  const markRead = useCallback(async () => {
    await sb.from('conversation_reads').upsert({ conversation_id: conv.id, user_id: me, last_read_at: new Date().toISOString() });
    onRead();
  }, [sb, conv.id, me, onRead]);

  useEffect(() => {
    let alive = true;
    sb.from('messages').select('*').eq('conversation_id', conv.id).order('created_at').then(({ data }: { data: Message[] | null }) => { if (alive) { setMessages(data ?? []); markRead(); } });
    const ch = sb.channel('conv-' + conv.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` }, (p: { new: Message }) => {
      setMessages(m => (m && !m.some(x => x.id === p.new.id) ? [...m, p.new] : m));
      markRead();
    }).subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [conv.id, sb, markRead]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages?.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!body.trim() && !files.length) return;
    setSending(true);
    try {
      const attachments: Attachment[] = [];
      for (const f of files) {
        if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} is larger than 25 MB`);
        const path = `${conv.organization_id}/messages/${conv.id}/${uid().slice(0, 8)}-${safeFileName(f.name)}`;
        const { error } = await sb.storage.from('portal').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) throw new Error(error.message);
        attachments.push({ path, name: f.name, size: f.size, type: f.type });
      }
      const { data, error } = await sb.from('messages').insert({ conversation_id: conv.id, body: body.trim() || (attachments.length === 1 ? `Shared ${attachments[0]!.name}` : `Shared ${attachments.length} files`), attachments }).select().single();
      if (error) throw new Error(error.message);
      setMessages(m => (m && !m.some(x => x.id === data.id) ? [...m, data as Message] : m));
      setBody(''); setFiles([]);
    } catch (err) { toast.error((err as Error).message); }
    finally { setSending(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <button onClick={onBack} className="rounded-lg p-1.5 text-fg-muted hover:bg-white/5 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{conv.subject}</h2>
          <p className="truncate text-[12px] text-fg-faint">{[staff && conv.organization?.name, conv.project?.name ?? 'General', `Started ${dateTime(conv.created_at)}`].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6" aria-live="polite">
        {messages === null && <p className="text-center text-[13px] text-fg-faint">Loading…</p>}
        <AnimatePresence initial={false}>
          {messages?.map(m => {
            const mine = m.sender_id === me, who = byId.get(m.sender_id ?? '');
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
                <Avatar name={who?.name ?? (who?.staff ? 'WeberAct' : '?')} size={30} className="mt-1" />
                <div className={cn('max-w-[78%]', mine && 'text-right')}>
                  <p className="mb-1 text-[11.5px] text-fg-faint">{mine ? 'You' : who?.name ?? 'WeberAct'}{who?.staff && !mine ? ' · WeberAct' : ''} · {ago(m.created_at)}</p>
                  <div className={cn('inline-block rounded-2xl px-4 py-2.5 text-left text-[14px] leading-relaxed whitespace-pre-wrap break-words', mine ? 'rounded-tr-md bg-coral-500 text-ink-950' : 'rounded-tl-md border border-line bg-ink-800 text-fg-soft')}>{m.body}</div>
                  {m.attachments?.length > 0 && (
                    <ul className={cn('mt-2 space-y-1.5', mine && 'flex flex-col items-end')}>
                      {m.attachments.map(a => (
                        <li key={a.path} className="flex max-w-full items-center gap-2 rounded-xl border border-line bg-white/[0.02] py-1 pl-3 pr-1 text-[12.5px] text-fg-soft">
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-faint" /><span className="truncate">{a.name}</span><span className="shrink-0 text-fg-faint">{bytes(a.size)}</span><FileButtons path={a.path} name={a.name} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={end} />
      </div>
      <form onSubmit={send} className="border-t border-line p-4">
        {files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((f, i) => <span key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1 text-[12px]">{f.name}<button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}><X className="h-3 w-3" /></button></span>)}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" multiple className="sr-only" onChange={e => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10)); e.target.value = ''; }} />
          <Button variant="ghost" size="icon" onClick={() => fileInput.current?.click()} aria-label="Attach files"><Paperclip className="h-4 w-4" /></Button>
          <Textarea value={body} onChange={e => setBody(e.target.value)} rows={1} placeholder="Write a message…" className="min-h-[42px] flex-1 resize-none py-2.5"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message" />
          <Button type="submit" size="icon" loading={sending} disabled={!body.trim() && !files.length} aria-label="Send"><SendHorizonal className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  );
}

function Compose({ open, onClose, staff, orgs, projects, defaultProject, onCreated }: {
  open: boolean; onClose: () => void; staff: boolean; orgs: { id: string; name: string }[]; projects: { id: string; name: string; organization_id: string }[]; defaultProject?: string; onCreated: (id: string) => void;
}) {
  const [org, setOrg] = useState(orgs[0]?.id ?? '');
  const [project, setProject] = useState(defaultProject ?? '');
  const [subject, setSubject] = useState(defaultProject ? `About ${projects.find(p => p.id === defaultProject)?.name ?? 'the project'}` : '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const shownProjects = staff ? projects.filter(p => p.organization_id === org) : projects;
  async function submit() {
    setBusy(true);
    const r = await startConversation({ subject, body, project_id: project || null, organization_id: staff ? org : undefined });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setSubject(''); setBody(''); onCreated(r.data!.id);
  }
  return (
    <Modal open={open} onClose={onClose} title="New conversation" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={subject.trim().length < 2 || !body.trim()}>Send</Button></>}>
      <div className="space-y-4">
        {staff && <Field label="Client" htmlFor="c-org"><Select id="c-org" value={org} onChange={e => { setOrg(e.target.value); setProject(''); }}>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>}
        <Field label="Project" htmlFor="c-proj"><Select id="c-proj" value={project} onChange={e => setProject(e.target.value)}><option value="">General</option>{shownProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Subject" htmlFor="c-subj"><Input id="c-subj" value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} /></Field>
        <Field label="Message" htmlFor="c-body"><Textarea id="c-body" rows={5} value={body} onChange={e => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
