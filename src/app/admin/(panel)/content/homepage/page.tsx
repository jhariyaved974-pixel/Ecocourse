import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HomepageEditor } from '@/components/admin/content/homepage-editor';
import { getTokenValues, loadHomepageEditor } from '../_lib/data';

export const metadata: Metadata = { title: 'Homepage' };

export default async function HomepageEditorPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [data, tokens] = await Promise.all([loadHomepageEditor(supabase), getTokenValues()]);
  return (
    <HomepageEditor
      sections={data.sections}
      hasChanges={data.hasChanges}
      revisions={data.revisions}
      categories={data.categories}
      collections={data.collections}
      tokens={tokens}
      loadError={data.error}
    />
  );
}
