'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#f6f4f0', color: '#141414' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#666' }}>Please refresh the page or try again in a moment.</p>
          {error.digest ? <p style={{ color: '#888', fontSize: 12, fontFamily: 'monospace' }}>Ref: {error.digest}</p> : null}
          <button onClick={reset} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 999, border: 0, background: '#141414', color: '#fff', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
