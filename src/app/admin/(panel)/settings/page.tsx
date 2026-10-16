import type { Metadata } from 'next';
import { requireStaffPage, ROLE_GROUPS } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/admin/ui';
import { StoreSettingsForm } from '@/components/admin/settings/store-settings-form';
import { Notice } from '@/components/ui/misc';
import { toMediaSummary } from '@/lib/admin/media';

export const metadata: Metadata = { title: 'Store settings' };

const ASSET = 'id, kind, bucket, storage_path, external_url, label, alt_text, mime_type, width, height';

export default async function StoreSettingsPage() {
  await requireStaffPage(ROLE_GROUPS.admin);
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase
    .from('store_settings')
    .select(`*, logo:media_assets!store_settings_logo_asset_id_fkey(${ASSET}), favicon:media_assets!store_settings_favicon_asset_id_fkey(${ASSET}), og:media_assets!store_settings_og_image_asset_id_fkey(${ASSET})`)
    .maybeSingle();
  if (!s) return <Notice tone="danger">Store settings are missing. Re-run the database migrations.</Notice>;
  return (
    <>
      <PageHeader title="Store settings" description="Changes apply to the live store immediately — no redeploy needed." />
      <StoreSettingsForm
        initial={{
          storeName: s.store_name,
          legalName: s.legal_name ?? '',
          tagline: s.tagline,
          supportEmail: s.support_email ?? '',
          supportPhone: s.support_phone ?? '',
          whatsappNumber: s.whatsapp_number ?? '',
          address: s.address ?? '',
          themePreset: s.theme_preset as 'noir',
          accentColor: s.accent_color,
          fontPreset: s.font_preset as 'editorial',
          seoTitle: s.seo_title,
          seoTitleTemplate: s.seo_title_template,
          seoDescription: s.seo_description,
          instagramUrl: s.instagram_url ?? '',
          facebookUrl: s.facebook_url ?? '',
          xUrl: s.x_url ?? '',
          youtubeUrl: s.youtube_url ?? '',
          pinterestUrl: s.pinterest_url ?? '',
          footerAbout: s.footer_about,
          footerNote: s.footer_note,
          maintenanceMode: s.maintenance_mode,
          maintenanceMessage: s.maintenance_message,
          analyticsProvider: s.analytics_provider as 'none',
          analyticsId: s.analytics_id ?? '',
          lowStockThreshold: String(s.low_stock_threshold),
          orderNumberPrefix: s.order_number_prefix,
          freeReturnsDays: String(s.free_returns_days),
          cartRemindersEnabled: s.cart_reminders_enabled,
          cartReminderDelayHours: String(s.cart_reminder_delay_hours),
        }}
        logo={s.logo ? toMediaSummary(s.logo) : null}
        favicon={s.favicon ? toMediaSummary(s.favicon) : null}
        ogImage={s.og ? toMediaSummary(s.og) : null}
      />
    </>
  );
}
