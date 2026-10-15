import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SizeGuideEditor } from '@/components/admin/content/size-guide-editor';

export const metadata: Metadata = { title: 'Size guide' };

export default async function SizeGuidePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage(ROLE_GROUPS.catalog);
  const { id } = await params;
  const isNew = id === 'new';
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: defaultGuide } = await supabase.from('size_guides').select('name').eq('is_default', true).maybeSingle();

  if (isNew) {
    return (
      <SizeGuideEditor
        guide={{ id: null, name: '', intro: '', notes: '', isDefault: !defaultGuide, rows: [] }}
        usage={{ products: 0, categories: 0 }}
        currentDefault={defaultGuide?.name ?? null}
      />
    );
  }

  const [guideRes, productsRes, categoriesRes] = await Promise.all([
    supabase.from('size_guides').select('id, name, intro, notes, is_default, updated_at, size_guide_rows(uk, us, eu, foot_length_cm, sort_order)').eq('id', id).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('size_guide_id', id),
    supabase.from('categories').select('id', { count: 'exact', head: true }).eq('size_guide_id', id),
  ]);
  if (guideRes.error) throw new Error(`Could not load size guide (${guideRes.error.code})`);
  const g = guideRes.data;
  if (!g) notFound();
  const rows = [...g.size_guide_rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <SizeGuideEditor
      key={g.updated_at}
      guide={{
        id: g.id,
        name: g.name,
        intro: g.intro,
        notes: g.notes,
        isDefault: g.is_default,
        rows: rows.map((r) => ({ uk: r.uk, us: r.us, eu: r.eu, footLengthCm: r.foot_length_cm === null ? '' : String(r.foot_length_cm) })),
      }}
      usage={{ products: productsRes.count ?? 0, categories: categoriesRes.count ?? 0 }}
      currentDefault={defaultGuide?.name ?? null}
    />
  );
}
