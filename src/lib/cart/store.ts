'use client';

import { useSyncExternalStore } from 'react';

// Guest cart persisted in localStorage. It only stores what the shopper picked
// (variant + quantity) plus display hints; prices, stock and totals are always
// re-computed on the server before anything is shown as payable.

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  colorName: string | null;
  sizeLabel: string;
  unitPrice: number; // display hint only
  quantity: number;
}

const KEY = 'auren.cart.v1';
export const MAX_QTY_PER_LINE = 10;
export const MAX_LINES = 30;

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: CartLine[] | null = null;
const EMPTY: CartLine[] = [];

function read(): CartLine[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((l): l is CartLine => typeof l?.variantId === 'string' && Number.isInteger(l?.quantity)).slice(0, MAX_LINES)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Storage may be unavailable (private mode); the in-memory cart still works.
  }
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      cache = null;
      for (const l of listeners) l();
    }
  });
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const cartStore = {
  get: read,
  add(line: Omit<CartLine, 'quantity'>, quantity = 1, maxAvailable = MAX_QTY_PER_LINE) {
    const lines = [...read()];
    const existing = lines.findIndex((l) => l.variantId === line.variantId);
    const limit = Math.min(MAX_QTY_PER_LINE, Math.max(maxAvailable, 0));
    if (existing >= 0) {
      const next = Math.min(lines[existing].quantity + quantity, limit);
      lines[existing] = { ...lines[existing], ...line, quantity: next };
    } else {
      if (lines.length >= MAX_LINES) return false;
      lines.unshift({ ...line, quantity: Math.min(quantity, limit) });
    }
    write(lines);
    return true;
  },
  setQuantity(variantId: string, quantity: number) {
    write(
      read()
        .map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(quantity, MAX_QTY_PER_LINE)) } : l))
        .filter((l) => l.quantity > 0),
    );
  },
  remove(variantId: string) {
    write(read().filter((l) => l.variantId !== variantId));
  },
  clear() {
    write([]);
  },
  /** Replaces the whole cart, e.g. with the saved cart after signing in on a new device. */
  replace(lines: CartLine[]) {
    write(lines.slice(0, MAX_LINES).map((l) => ({ ...l, quantity: Math.max(1, Math.min(l.quantity, MAX_QTY_PER_LINE)) })));
  },
  subscribe,
  /** Replace display hints with server-validated values after a quote. */
  reconcile(updates: { variantId: string; unitPrice: number; quantity: number }[]) {
    const byId = new Map(updates.map((u) => [u.variantId, u]));
    const lines = read();
    let changed = false;
    const next = lines.map((l) => {
      const u = byId.get(l.variantId);
      if (u && (u.unitPrice !== l.unitPrice || u.quantity !== l.quantity)) {
        changed = true;
        return { ...l, unitPrice: u.unitPrice, quantity: u.quantity };
      }
      return l;
    });
    if (changed) write(next);
  },
};

export function useCart() {
  const lines = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const estimatedSubtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
  return { lines, count, estimatedSubtotal };
}

// Lightweight cross-component signal for opening the cart drawer.
const drawerListeners = new Set<(open: boolean) => void>();
export function onCartDrawer(fn: (open: boolean) => void) {
  drawerListeners.add(fn);
  return () => {
    drawerListeners.delete(fn);
  };
}
export function openCartDrawer() {
  for (const fn of drawerListeners) fn(true);
}
