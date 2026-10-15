import type { Metadata } from 'next';
import Link from 'next/link';
import { EyeOff, FilePen } from 'lucide-react';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadHomepage } from '@/lib/content/queries';
import { HomeSections } from '@/components/home/sections';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Notice } from '@/components/ui/misc';

export const metadata: Metadata = { title: 'Homepage preview' };

export default async function HomepagePreviewPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  // loadHomepage reads with whatever client it is given; the staff session's
  // client can read the draft rows (RLS), the public client cannot.
  const [sections, hiddenRes, changesRes] = await Promise.all([
    loadHomepage(supabase as unknown as Parameters<typeof loadHomepage>[0], 'draft'),
    supabase.from('homepage_sections').select('id').eq('version', 'draft').eq('is_visible', false),
    supabase.rpc('homepage_has_unpublished_changes'),
  ]);
  const hidden = new Set((hiddenRes.data ?? []).map((r) => r.id));
  const visible = sections.filter((s) => !hidden.has(s.id));
  const hasChanges = Boolean(changesRes.data);

  return (
    <>
      <div
        role="status"
        className="sticky top-2 z-40 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm backdrop-blur"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <EyeOff className="size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong className="font-semibold">Draft preview — not visible to customers.</strong>{' '}
            <span className="text-ink-2">
              Showing the last saved draft{hidden.size ? ` (${hidden.size} hidden section${hidden.size === 1 ? '' : 's'} left out)` : ''}. Unsaved edits are not included.
            </span>
          </p>
          {hasChanges ? <Badge tone="warning">Unpublished changes</Badge> : <Badge tone="success">Same as live</Badge>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/" target="_blank" rel="noopener noreferrer">
              View live homepage
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/content/homepage">
              <FilePen /> Back to editor
            </Link>
          </Button>
        </div>
      </div>
      {hiddenRes.error ? (
        <Notice tone="danger" className="mb-6">
          The draft could not be loaded completely. Please refresh the page.
        </Notice>
      ) : null}
      {visible.length ? (
        // Storefront sections render inside the admin shell; the first hero
        // normally slides under the site header, so give it that room.
        <div className="isolate overflow-hidden rounded-2xl border border-line bg-paper text-ink">
          {visible[0]?.type === 'hero' ? <div data-surface="dark" className="h-16 lg:h-[72px]" aria-hidden /> : null}
          <HomeSections sections={visible} />
        </div>
      ) : (
        <EmptyState title="Nothing to preview" description="The draft has no visible sections. Add or show a section in the editor." />
      )}
    </>
  );
}
