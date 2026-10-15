'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, EyeOff, Plus, RefreshCw, RotateCcw, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form-controls';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, Notice } from '@/components/ui/misc';
import { Markdown } from '@/components/store/markdown';
import { PageHeader, Panel } from '@/components/admin/ui';
import { ConfirmActionButton, useActionRunner } from '@/components/admin/client-ui';
import { createPage, deletePage, discardPageDraft, publishPage, restorePageRevision, savePageDraft, unpublishPage } from '@/app/admin/(panel)/content/pages/actions';
import { PAGE_LIMITS, previewTokens, type RevisionRow, type TokenValues } from '@/lib/admin/content';
import { defaultSlugFor } from '@/lib/admin/products';
import { formatDateTime } from '@/lib/utils';
import { useUnsavedChangesWarning } from './sortable';
import { TokenHelp } from './token-help';

export interface PageEditorValue {
  id: string;
  slug: string;
  title: string;
  body: string;
  draftTitle: string | null;
  draftBody: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  seoTitle: string;
  seoDescription: string;
  updatedAt: string;
}

export function PageStatusBadge({ isPublished, hasDraft }: { isPublished: boolean; hasDraft: boolean }) {
  if (!isPublished) return <Badge tone="neutral">Not published</Badge>;
  if (hasDraft) return <Badge tone="warning">Unpublished changes</Badge>;
  return <Badge tone="success">Published</Badge>;
}

export function PageEditor({ page, revisions, menuLinks, tokens }: { page: PageEditorValue; revisions: RevisionRow[]; menuLinks: number; tokens: TokenValues }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const initial = React.useMemo(
    () => ({
      slug: page.slug,
      title: page.draftTitle ?? page.title,
      body: page.draftBody ?? page.body,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
    }),
    [page],
  );
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<'save' | 'publish' | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const hasDraft = page.draftTitle !== null || page.draftBody !== null;
  useUnsavedChangesWarning(dirty);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const submit = async (mode: 'save' | 'publish') => {
    setBusy(mode);
    const payload = { id: page.id, ...form };
    const res = await run(() => (mode === 'publish' ? publishPage(payload) : savePageDraft(payload)));
    setBusy(null);
    setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
  };

  const previewTitle = previewTokens(form.title, tokens);
  const previewBody = previewTokens(form.body, tokens);

  return (
    <>
      <PageHeader
        back={{ href: '/admin/content/pages', label: 'Pages' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {page.draftTitle ?? page.title}
            <PageStatusBadge isPublished={page.isPublished} hasDraft={hasDraft} />
          </span>
        }
        description={page.isPublished && page.publishedAt ? `/pages/${page.slug} · last published ${formatDateTime(page.publishedAt)}` : `/pages/${page.slug}`}
        actions={
          <>
            {page.isPublished ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/pages/${page.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> View live page
                </a>
              </Button>
            ) : null}
            {page.isPublished ? (
              <ConfirmActionButton
                title="Unpublish this page?"
                description={
                  <>
                    Visitors to /pages/{page.slug} will get “page not found”.
                    {menuLinks ? ` ${menuLinks} menu link${menuLinks === 1 ? ' points' : 's point'} here — hide or remove ${menuLinks === 1 ? 'it' : 'them'} under Navigation.` : ''}
                  </>
                }
                confirmLabel="Unpublish"
                danger
                action={() => unpublishPage(page.id)}
              >
                <EyeOff /> Unpublish
              </ConfirmActionButton>
            ) : null}
            <ConfirmActionButton
              title="Delete this page?"
              description={
                <>
                  “{page.draftTitle ?? page.title}” and its publish history are removed permanently.
                  {menuLinks ? ` ${menuLinks} menu link${menuLinks === 1 ? ' still points' : 's still point'} here.` : ''}
                </>
              }
              confirmLabel="Delete page"
              danger
              variant="danger-outline"
              action={async () => {
                const res = await deletePage(page.id);
                if (res.ok) router.push('/admin/content/pages');
                return res;
              }}
            >
              <Trash2 /> Delete
            </ConfirmActionButton>
          </>
        }
      />

      {page.isPublished && hasDraft ? (
        <Notice tone="warning" className="mb-6" title="This page has unpublished changes">
          Visitors still see the last published version. Publish to make the draft live, or discard the draft.
        </Notice>
      ) : null}
      {!page.isPublished ? (
        <Notice tone="neutral" className="mb-6">
          This page is not published, so visitors get “page not found”. Publish it when it is ready.
        </Notice>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit('save');
        }}
        className="space-y-6"
      >
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Panel title="Content" description="Markdown: **bold**, *italic*, ## headings, lists, tables and [links](/shop). HTML and images are not rendered.">
            <div className="space-y-4">
              <Field label="Title" htmlFor="page-title" required error={errors.title} hint={`${form.title.length}/${PAGE_LIMITS.title}`}>
                <Input id="page-title" value={form.title} maxLength={PAGE_LIMITS.title} onChange={(e) => set('title', e.target.value)} aria-invalid={errors.title ? true : undefined} />
              </Field>
              <Field label="Page text" htmlFor="page-body" error={errors.body} hint={`${form.body.length.toLocaleString('en-IN')}/${PAGE_LIMITS.body.toLocaleString('en-IN')}`}>
                <Textarea
                  id="page-body"
                  rows={22}
                  value={form.body}
                  maxLength={PAGE_LIMITS.body}
                  onChange={(e) => set('body', e.target.value)}
                  className="font-mono text-[13px]"
                  aria-invalid={errors.body ? true : undefined}
                />
              </Field>
              <TokenHelp values={tokens} compact />
            </div>
          </Panel>
          <Panel title="Live preview" description="Rendered exactly like the store, with placeholders filled in." className="xl:sticky xl:top-4">
            <article className="max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-paper px-5 py-6" aria-label="Page preview">
              <h2 className="font-display text-4xl leading-tight">{previewTitle || 'Untitled page'}</h2>
              {previewBody.trim() ? (
                <Markdown className="prose-store mt-6 text-[15px]">{previewBody}</Markdown>
              ) : (
                <p className="mt-6 text-sm text-muted">Start typing to see the page.</p>
              )}
            </article>
          </Panel>
        </div>

        <Panel title="URL and search engines" description="These apply as soon as you save (they are not part of the draft).">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="URL slug"
              htmlFor="page-slug"
              required
              error={errors.slug}
              hint={
                form.slug !== page.slug && page.isPublished
                  ? `Changing the URL breaks links shared elsewhere. Menu links to /pages/${page.slug} are updated automatically.`
                  : `/pages/${form.slug || '…'}`
              }
            >
              <div className="flex gap-2">
                <Input
                  id="page-slug"
                  value={form.slug}
                  maxLength={120}
                  onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  aria-invalid={errors.slug ? true : undefined}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Generate slug from title" onClick={() => set('slug', defaultSlugFor(form.title))}>
                  <RefreshCw />
                </Button>
              </div>
            </Field>
            <div className="hidden md:block" />
            <Field label="SEO title" htmlFor="page-seo-title" error={errors.seoTitle} hint={`Defaults to the page title · ${form.seoTitle.length}/${PAGE_LIMITS.seoTitle}`}>
              <Input id="page-seo-title" value={form.seoTitle} maxLength={PAGE_LIMITS.seoTitle} placeholder={previewTitle} onChange={(e) => set('seoTitle', e.target.value)} />
            </Field>
            <Field label="SEO description" htmlFor="page-seo-desc" error={errors.seoDescription} hint={`${form.seoDescription.length}/${PAGE_LIMITS.seoDescription}`}>
              <Textarea id="page-seo-desc" rows={2} value={form.seoDescription} maxLength={PAGE_LIMITS.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
            </Field>
          </div>
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          {dirty ? <Badge tone="warning" className="mr-auto">Unsaved changes</Badge> : null}
          {hasDraft && !dirty ? (
            <ConfirmActionButton
              title="Discard the draft?"
              description="The editor goes back to the live text. Unpublished edits are lost."
              confirmLabel="Discard draft"
              danger
              variant="ghost"
              action={() => discardPageDraft(page.id)}
            >
              <Undo2 /> Discard draft
            </ConfirmActionButton>
          ) : null}
          <Button type="submit" variant="outline" size="sm" loading={busy === 'save'} disabled={pending}>
            <Save /> Save draft
          </Button>
          <Button type="button" size="sm" loading={busy === 'publish'} disabled={pending} onClick={() => submit('publish')}>
            <Send /> {page.isPublished ? 'Save & publish' : 'Publish'}
          </Button>
        </div>
      </form>

      <Panel title="Publish history" className="mt-6" description="Copy an earlier version into the draft, then publish it to roll back.">
        {revisions.length ? (
          <ol className="-my-2 divide-y divide-line">
            {revisions.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {formatDateTime(r.publishedAt)}
                    {i === 0 && page.isPublished ? <Badge tone="success">Live</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">{r.author ?? 'System'}</p>
                </div>
                <ConfirmActionButton
                  title="Copy this version into the draft?"
                  description={`The draft title and text are replaced with the version published ${formatDateTime(r.publishedAt)}. Publish afterwards to make it live.`}
                  confirmLabel="Copy into draft"
                  action={() => restorePageRevision({ pageId: page.id, revisionId: r.id })}
                >
                  <RotateCcw /> Restore
                </ConfirmActionButton>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">This page has not been published from the admin yet.</p>
        )}
      </Panel>
    </>
  );
}

export function NewPageButton() {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New page
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTitle('');
            setSlug('');
            setSlugTouched(false);
            setErrors({});
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>Creates an unpublished page. Write it, preview it, then publish.</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(() => createPage({ title, slug }), { refresh: false, onSuccess: (d) => router.push(`/admin/content/pages/${d.id}`) });
              setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
            }}
          >
            <Field label="Title" htmlFor="new-page-title" required error={errors.title}>
              <Input
                id="new-page-title"
                value={title}
                maxLength={PAGE_LIMITS.title}
                placeholder="Care guide"
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(defaultSlugFor(e.target.value));
                }}
              />
            </Field>
            <Field label="URL slug" htmlFor="new-page-slug" required error={errors.slug} hint={`/pages/${slug || '…'}`}>
              <Input
                id="new-page-slug"
                value={slug}
                maxLength={120}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                }}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Create page
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
