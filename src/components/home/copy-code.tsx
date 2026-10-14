'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-3 rounded-full border border-current/40 bg-white/10 py-2.5 pr-3 pl-5 font-mono text-lg font-semibold tracking-[0.2em] transition-colors hover:bg-white/20"
      aria-label={`Copy coupon code ${code}`}
    >
      {code}
      <span className="grid size-8 place-items-center rounded-full bg-white/20" aria-hidden>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </span>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
}
