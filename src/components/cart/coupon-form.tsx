'use client';

import * as React from 'react';
import { Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { couponErrorMessage, type Quote } from '@/lib/orders/quote';
import { setCouponCode } from '@/lib/cart/coupon';
import { formatMoney } from '@/lib/utils';

export function CouponForm({ code, quote, loading }: { code: string; quote: Quote | null; loading: boolean }) {
  const [draft, setDraft] = React.useState('');
  const coupon = quote?.coupon ?? null;
  const error = coupon?.code === code && coupon.errorCode ? couponErrorMessage(coupon.errorCode, coupon.errorData, formatMoney) : null;
  const applied = coupon?.code === code && !coupon.errorCode;

  if (code) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-dashed border-line-strong px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <Tag className="size-4" />
            <span className="font-mono font-semibold tracking-wider">{code}</span>
            {applied ? <span className="text-success">−{formatMoney(coupon!.amount)}</span> : null}
          </span>
          <button type="button" onClick={() => setCouponCode('')} className="grid size-7 place-items-center rounded-full hover:bg-surface-2" aria-label="Remove coupon">
            <X className="size-4" />
          </button>
        </div>
        {error && !loading ? <p className="text-xs text-danger" role="alert">{error}</p> : null}
        {applied && coupon?.description ? <p className="text-xs text-muted">{coupon.description}</p> : null}
      </div>
    );
  }

  // Not a <form>: this sits inside the checkout form, and forms cannot nest.
  const apply = () => {
    const value = draft.trim().toUpperCase();
    if (/^[A-Z0-9_-]{2,32}$/.test(value)) {
      setCouponCode(value);
      setDraft('');
    }
  };
  return (
    <div className="flex gap-2">
      <label htmlFor="coupon" className="sr-only">Coupon code</label>
      <Input
        id="coupon"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="Coupon code"
        maxLength={32}
        autoCapitalize="characters"
        className="uppercase placeholder:normal-case"
      />
      <Button type="button" variant="outline" onClick={apply} disabled={draft.trim().length < 2}>Apply</Button>
    </div>
  );
}
