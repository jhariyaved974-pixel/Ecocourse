'use client';
import { Button } from '@/components/ui/primitives';
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-4">Something went wrong</p>
      <h1 className="text-2xl font-semibold tracking-tight">We could not load this page</h1>
      <p className="mt-3 max-w-md text-[14px] text-fg-muted">{error.digest ? `Reference ${error.digest}. ` : ''}Try again, and if it keeps happening, message the WeberAct team.</p>
      <div className="mt-8 flex gap-3"><Button onClick={reset}>Try again</Button><Button variant="secondary" href="/">Go to dashboard</Button></div>
    </div>
  );
}
