'use client';

import { useSyncExternalStore } from 'react';

// The coupon a shopper entered in the cart, carried into checkout for this
// browser session. It is only a code: the server validates it on every quote.
const KEY = 'auren.coupon';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCouponCode(code: string) {
  try {
    if (code) window.sessionStorage.setItem(KEY, code.toUpperCase());
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function useCouponCode() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => '',
  );
}
