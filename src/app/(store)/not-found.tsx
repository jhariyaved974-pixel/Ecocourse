import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow text-muted">Error 404</p>
      <h1 className="mt-4 font-display text-6xl md:text-7xl">Wrong turn.</h1>
      <p className="mt-4 max-w-md text-muted">The page you were looking for has moved, sold out for good, or never existed.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/shop">Shop all products</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
