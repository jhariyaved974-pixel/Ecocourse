import { Wordmark } from './wordmark';

export function MaintenancePage({ storeName, message, email }: { storeName: string; message: string; email: string | null }) {
  return (
    <main id="main" className="flex min-h-svh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
      <p>
        <Wordmark name={storeName} className="text-3xl" mark markClassName="size-6" />
      </p>
      <h1 className="mt-10 font-display text-5xl md:text-6xl">Back shortly</h1>
      <p className="mt-4 max-w-md text-muted">{message}</p>
      {email ? (
        <p className="mt-8 text-sm text-muted">
          Questions about an order? Write to <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a>.
        </p>
      ) : null}
    </main>
  );
}
