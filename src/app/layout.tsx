import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Toaster } from 'sonner';
import './globals.css';
import { fontVariables } from './fonts';
import { getStoreSettings } from '@/lib/content/queries';
import { publicEnv } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getStoreSettings();
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: s.seo_title, template: s.seo_title_template },
    description: s.seo_description,
    applicationName: s.store_name,
    openGraph: {
      type: 'website',
      siteName: s.store_name,
      locale: 'en_IN',
      images: s.ogImageUrl ? [{ url: s.ogImageUrl, width: 1200, height: 630, alt: s.store_name }] : undefined,
    },
    twitter: { card: 'summary_large_image' },
    icons: s.faviconUrl ? { icon: s.faviconUrl } : undefined,
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#111112',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const settings = await getStoreSettings();
  return (
    <html
      lang="en-IN"
      data-theme={settings.theme_preset}
      data-font={settings.font_preset}
      style={{ ['--accent' as string]: settings.accent_color }}
      className={`${fontVariables} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-center" toastOptions={{ className: 'font-sans', style: { borderRadius: 14 } }} />
        {settings.analytics_provider === 'plausible' && settings.analytics_id ? (
          <Script defer data-domain={settings.analytics_id} src="https://plausible.io/js/script.js" strategy="afterInteractive" />
        ) : null}
        {settings.analytics_provider === 'ga4' && settings.analytics_id ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(settings.analytics_id)}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(settings.analytics_id)},{anonymize_ip:true});`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
