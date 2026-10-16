import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabase = supabaseUrl ? new URL(supabaseUrl) : null;
const isDev = process.env.NODE_ENV !== 'production';
// Only for local end-to-end tests where Storage runs on 127.0.0.1.
const allowLocalImages = process.env.ALLOW_LOCAL_IMAGE_OPTIMIZATION === '1';

const supabaseOrigins = supabase ? [supabase.origin, `${supabase.protocol === 'https:' ? 'wss' : 'ws'}://${supabase.host}`] : [];

const csp = [
  "default-src 'self'",
  // Next.js inlines hydration scripts; 'wasm-unsafe-eval' is required by the meshopt decoder for 3D models.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://checkout.razorpay.com https://plausible.io https://www.googletagmanager.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigins[0] ?? ''} https://www.googletagmanager.com`,
  "font-src 'self' data:",
  `media-src 'self' blob: ${supabaseOrigins[0] ?? ''}`,
  // blob: lets the 3D viewer decode textures embedded in product GLB models (three.js fetches them as blob URLs).
  `connect-src 'self' blob: ${supabaseOrigins.join(' ')} https://api.razorpay.com https://lumberjack.razorpay.com https://plausible.io https://www.google-analytics.com https://region1.google-analytics.com`,
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com"), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  cacheLife: {
    // Catalogue and content are also invalidated on every admin edit via tags;
    // these lifetimes only bound staleness for anything not explicitly tagged.
    catalog: { stale: 300, revalidate: 300, expire: 86_400 },
    content: { stale: 300, revalidate: 600, expire: 86_400 },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [70, 75, 85],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920, 2400],
    remotePatterns: supabase
      ? [{ protocol: supabase.protocol.replace(':', '') as 'http' | 'https', hostname: supabase.hostname, port: supabase.port, pathname: '/storage/v1/object/public/**' }]
      : [],
    dangerouslyAllowLocalIP: allowLocalImages,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
    ];
  },
};

export default nextConfig;
