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

  if (isNew) {
    return <SizeGuideEditor guide={{ id: null, name: '', intro: '', notes: '', columns: [], rows: [] }} usage={{ products: 0, categories: [] }} />;
  }

  const supabase = await createSupabaseServerClient();
  const [guideRes, productsRes, categoriesRes] = await Promise.all([
    supabase.from('size_guides').select('id, name, intro, notes, columns, updated_at, size_guide_rows(cells, sort_order)').eq('id', id).maybeSingle(),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('size_guide_id', id),
    supabase.from('categories').select('name').eq('size_guide_id', id).order('sort_order').order('name'),
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
        columns: g.columns,
        // Pad or trim defensively so every row has exactly one cell per column.
        rows: rows.map((r) => g.columns.map((_, i) => r.cells[i] ?? '')),
      }}
      usage={{ products: productsRes.count ?? 0, categories: (categoriesRes.data ?? []).map((c) => c.name) }}
    />
  );
}
