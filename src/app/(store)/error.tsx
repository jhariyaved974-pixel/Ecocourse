'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Never shows internal error details; the digest helps match server logs.
export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow text-muted">Something went wrong</p>
      <h1 className="mt-4 font-display text-5xl md:text-6xl">We hit a snag.</h1>
      <p className="mt-4 max-w-md text-muted">Please try again. If it keeps happening, contact us and mention the reference below.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-muted">Ref: {error.digest}</p> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
