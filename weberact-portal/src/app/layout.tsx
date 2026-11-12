import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'WeberAct Client Portal', template: '%s · WeberAct' },
  description: 'Projects, contracts, billing, files and reports for WeberAct clients.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { themeColor: '#08080a', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: '#16161b', border: '1px solid rgb(255 255 255 / 0.1)', color: '#f2efe9', borderRadius: 14 } }} />
      </body>
    </html>
  );
}
