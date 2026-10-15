import Link from 'next/link';

export default function GlobalNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
      <p className="eyebrow text-muted">Error 404</p>
      <h1 className="font-display text-5xl">Page not found</h1>
      <Link href="/" className="underline underline-offset-4">Go to the homepage</Link>
    </main>
  );
}
