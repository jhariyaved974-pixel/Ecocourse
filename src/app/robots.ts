import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  // The admin-only deployment must never be indexed.
  if (process.env.APP_MODE === 'admin') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private or per-visitor pages; product listings with filters stay crawlable via canonical URLs.
        disallow: ['/admin', '/api/', '/account', '/cart', '/checkout', '/orders/', '/wishlist', '/email/'],
      },
    ],
    sitemap: `${publicEnv.siteUrl}/sitemap.xml`,
    host: publicEnv.siteUrl,
  };
}
