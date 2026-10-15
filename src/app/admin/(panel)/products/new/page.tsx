import type { Metadata } from 'next';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStoreSettings } from '@/lib/content/queries';
import { emptyProductForm } from '@/lib/admin/products';
import { ProductEditor } from '@/components/admin/products/product-editor';
import { getCatalogLookups } from '../_lib/data';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const staff = await requireStaffPage(ROLE_GROUPS.catalog);
  const supabase = await createSupabaseServerClient();
  const [lookups, settings] = await Promise.all([getCatalogLookups(supabase), getStoreSettings()]);
  return (
    <ProductEditor
      initial={emptyProductForm()}
      meta={null}
      lookups={lookups}
      canSeeCost={roleAllowed(staff.role, ROLE_GROUPS.admin)}
      canDelete={false}
      defaultLowStock={settings.low_stock_threshold}
    />
  );
}
