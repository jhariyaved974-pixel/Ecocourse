'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, zodFieldErrors } from '@/lib/errors';
import { CONTENT_TAGS } from '@/lib/content/queries';
import { TAGS } from '@/lib/catalog/queries';

const optional = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v));
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s<>"]+$/i.test(v), 'Use a full https:// link.')
  .transform((v) => (v === '' ? null : v));
const email = z.string().trim().max(254).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v), 'Enter a valid email.').transform((v) => (v === '' ? null : v));

const storeSchema = z
  .object({
    storeName: z.string().trim().min(1, 'Enter the store name.').max(60),
    legalName: optional(120),
    tagline: z.string().trim().max(160),
    supportEmail: email,
    supportPhone: z.string().trim().refine((v) => v === '' || /^\+?[0-9][0-9 -]{6,18}$/.test(v), 'Enter a valid phone number.').transform((v) => (v === '' ? null : v)),
    whatsappNumber: z.string().trim().refine((v) => v === '' || /^\+?[0-9]{8,15}$/.test(v), 'Digits only, with country code (e.g. +919876543210).').transform((v) => (v === '' ? null : v)),
    address: optional(500),
    themePreset: z.enum(['noir', 'bone', 'ember', 'forest']),
    accentColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex colour like #C2410C.'),
    fontPreset: z.enum(['editorial', 'modern', 'classic']),
    seoTitle: z.string().trim().min(1).max(70),
    seoTitleTemplate: z.string().trim().max(70).refine((v) => v.includes('%s'), 'Include %s where the page title goes.'),
    seoDescription: z.string().trim().max(170),
    instagramUrl: httpsUrl,
    facebookUrl: httpsUrl,
    xUrl: httpsUrl,
    youtubeUrl: httpsUrl,
    pinterestUrl: httpsUrl,
    footerAbout: z.string().trim().max(400),
    footerNote: z.string().trim().max(200),
    maintenanceMode: z.boolean(),
    maintenanceMessage: z.string().trim().min(5, 'Write a short message for visitors.').max(300),
    analyticsProvider: z.enum(['none', 'plausible', 'ga4']),
    analyticsId: z.string().trim().max(80).transform((v) => (v === '' ? null : v)),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000),
    orderNumberPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,4}$/, '2–4 capital letters.'),
    freeReturnsDays: z.coerce.number().int().min(0).max(90),
    cartRemindersEnabled: z.boolean(),
    cartReminderDelayHours: z.coerce.number().int().min(1, 'At least 1 hour.').max(72, 'At most 72 hours.'),
    logoAssetId: z.uuid().nullable(),
    faviconAssetId: z.uuid().nullable(),
    ogImageAssetId: z.uuid().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.analyticsProvider === 'plausible' && !(v.analyticsId && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.analyticsId))) {
      ctx.addIssue({ code: 'custom', path: ['analyticsId'], message: 'Enter the Plausible site domain, e.g. auren.in' });
    }
    if (v.analyticsProvider === 'ga4' && !(v.analyticsId && /^G-[A-Z0-9]{4,20}$/.test(v.analyticsId))) {
      ctx.addIssue({ code: 'custom', path: ['analyticsId'], message: 'Enter the GA4 measurement ID, e.g. G-ABC123XYZ' });
    }
  });

export type StoreSettingsInput = z.input<typeof storeSchema>;

export async function saveStoreSettings(input: StoreSettingsInput) {
  return staffAction(ROLE_GROUPS.admin, async ({ staff, supabase }) => {
    const parsed = storeSchema.safeParse(input);
    if (!parsed.success) return fail('Please check the highlighted fields.', 'validation', zodFieldErrors(parsed.error.issues));
    const v = parsed.data;
    const { error } = await supabase
      .from('store_settings')
      .update({
        store_name: v.storeName,
        legal_name: v.legalName,
        tagline: v.tagline,
        support_email: v.supportEmail,
        support_phone: v.supportPhone,
        whatsapp_number: v.whatsappNumber,
        address: v.address,
        theme_preset: v.themePreset,
        accent_color: v.accentColor.toUpperCase(),
        font_preset: v.fontPreset,
        seo_title: v.seoTitle,
        seo_title_template: v.seoTitleTemplate,
        seo_description: v.seoDescription,
        instagram_url: v.instagramUrl,
        facebook_url: v.facebookUrl,
        x_url: v.xUrl,
        youtube_url: v.youtubeUrl,
        pinterest_url: v.pinterestUrl,
        footer_about: v.footerAbout,
        footer_note: v.footerNote,
        maintenance_mode: v.maintenanceMode,
        maintenance_message: v.maintenanceMessage,
        analytics_provider: v.analyticsProvider,
        analytics_id: v.analyticsProvider === 'none' ? null : v.analyticsId,
        low_stock_threshold: v.lowStockThreshold,
        order_number_prefix: v.orderNumberPrefix,
        free_returns_days: v.freeReturnsDays,
        cart_reminders_enabled: v.cartRemindersEnabled,
        cart_reminder_delay_hours: v.cartReminderDelayHours,
        logo_asset_id: v.logoAssetId,
        favicon_asset_id: v.faviconAssetId,
        og_image_asset_id: v.ogImageAssetId,
        updated_by: staff.user.id,
      })
      .eq('id', true);
    if (error) return dbFail(error);
    updateTag(CONTENT_TAGS.settings);
    updateTag(CONTENT_TAGS.content);
    updateTag(CONTENT_TAGS.homepage);
    updateTag(TAGS.catalog);
    return ok(null, 'Store settings saved');
  });
}
