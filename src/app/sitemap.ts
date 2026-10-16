import type { MetadataRoute } from 'next';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { isSupabaseConfigured, publicEnv } from '@/lib/env';
import { TAGS } from '@/lib/catalog/queries';
import { CONTENT_TAGS } from '@/lib/content/queries';

const STATIC_PATHS = ['/', '/shop', '/faq', '/size-guide'];

/** Published catalogue and content only (RLS on the anonymous client enforces it). */
async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  'use cache';
  cacheLife('catalog');
  cacheTag(TAGS.catalog, CONTENT_TAGS.pages);
  const site = publicEnv.siteUrl;
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${site}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' || path === '/shop' ? 'daily' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
  if (!isSupabaseConfigured) return entries;

  const db = createSupabasePublicClient();
  const [products, categories, collections, pages] = await Promise.all([
    db.from('products').select('slug, updated_at').eq('status', 'published').order('updated_at', { ascending: false }).limit(5000),
    db.from('categories').select('slug, updated_at').eq('is_visible', true),
    db.from('collections').select('slug, updated_at').eq('is_visible', true),
    db.from('pages').select('slug, updated_at').eq('is_published', true),
  ]);
  for (const c of categories.data ?? []) entries.push({ url: `${site}/category/${c.slug}`, lastModified: c.updated_at, changeFrequency: 'weekly', priority: 0.7 });
  for (const c of collections.data ?? []) entries.push({ url: `${site}/collections/${c.slug}`, lastModified: c.updated_at, changeFrequency: 'weekly', priority: 0.6 });
  for (const p of products.data ?? []) entries.push({ url: `${site}/products/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'weekly', priority: 0.8 });
  for (const p of pages.data ?? []) entries.push({ url: `${site}/pages/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'yearly', priority: 0.3 });
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries();
}
