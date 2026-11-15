import { Button } from '@/components/ui/primitives';
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow mb-4">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">This page is not here</h1>
      <p className="mt-3 max-w-md text-fg-muted">It may have moved, or you may not have access to it.</p>
      <Button href="/" className="mt-8">Back to the portal</Button>
    </div>
  );
}
