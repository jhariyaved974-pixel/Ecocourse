import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/misc';
import { FaqManager } from '@/components/admin/content/faq-manager';
import { getTokenValues } from '../_lib/data';

export const metadata: Metadata = { title: 'FAQs' };

export default async function FaqsPage() {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [res, tokens] = await Promise.all([
    supabase.from('faqs').select('id, group_name, question, answer, sort_order, is_visible, updated_at').order('sort_order').order('created_at'),
    getTokenValues(),
  ]);
  return (
    <>
      <PageHeader
        title="FAQs"
        description="Questions and answers on the /faq page. Changes go live as soon as you save them."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/faq" target="_blank" rel="noopener noreferrer">
              View /faq
            </a>
          </Button>
        }
      />
      {res.error ? (
        <Notice tone="danger" className="mb-6">
          Questions could not be loaded. Please refresh the page.
        </Notice>
      ) : null}
      <FaqManager
        tokens={tokens}
        faqs={(res.data ?? []).map((f) => ({ id: f.id, groupName: f.group_name, question: f.question, answer: f.answer, isVisible: f.is_visible, updatedAt: f.updated_at }))}
      />
    </>
  );
}
