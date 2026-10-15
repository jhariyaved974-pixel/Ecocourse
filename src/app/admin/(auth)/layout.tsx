import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-paper px-4 py-12 text-ink">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
