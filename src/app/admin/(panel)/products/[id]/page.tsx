import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStoreSettings } from '@/lib/content/queries';
import { ProductEditor } from '@/components/admin/products/product-editor';
import { getCatalogLookups, getProductForEditor } from '../_lib/data';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.catalog);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const canSeeCost = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const supabase = await createSupabaseServerClient();
  const [data, lookups, settings] = await Promise.all([
    getProductForEditor(supabase, id, { includeCost: canSeeCost }),
    getCatalogLookups(supabase),
    getStoreSettings(),
  ]);
  if (!data) notFound();
  return (
    <ProductEditor
      // Remount with fresh state after every save (updated_at changes).
      key={data.meta.updatedAt}
      initial={data.form}
      meta={data.meta}
      lookups={lookups}
      canSeeCost={canSeeCost}
      canDelete={roleAllowed(staff.role, ROLE_GROUPS.admin)}
      defaultLowStock={settings.low_stock_threshold}
    />
  );
}
