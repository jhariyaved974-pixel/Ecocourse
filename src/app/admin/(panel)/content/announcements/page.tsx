import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/admin/ui';
import { Notice } from '@/components/ui/misc';
import { AnnouncementManager } from '@/components/admin/content/announcement-manager';
import { getTokenValues, type ServerClient } from '../_lib/data';

async function loadAnnouncements(supabase: ServerClient) {
  const res = await supabase.from('announcements').select('id, message, href, is_active, sort_order, starts_at, ends_at, updated_at').order('sort_order').order('created_at');
  // Request-time clock for the Live/Scheduled/Ended badges (the page is dynamic: it reads the staff session).
  return { ...res, now: Date.now() };
}

export const metadata: Metadata = { title: 'Announcements' };

export default async function AnnouncementsPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [res, tokens] = await Promise.all([loadAnnouncements(supabase), getTokenValues()]);
  return (
    <>
      <PageHeader title="Announcements" description="Short messages in the bar at the top of every store page. Changes go live as soon as you save them." />
      {res.error ? (
        <Notice tone="danger" className="mb-6">
          Announcements could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      <AnnouncementManager
        now={res.now}
        tokens={tokens}
        announcements={(res.data ?? []).map((a) => ({
          id: a.id,
          message: a.message,
          href: a.href,
          isActive: a.is_active,
          startsAt: a.starts_at,
          endsAt: a.ends_at,
          updatedAt: a.updated_at,
        }))}
      />
    </>
  );
}
