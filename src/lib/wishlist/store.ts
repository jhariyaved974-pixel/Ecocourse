'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isSupabaseConfigured } from '@/lib/env';

// Guests keep their wishlist in localStorage. Signed-in customers' wishlists
// live in the database (RLS: own rows only); local items are merged on login.

const KEY = 'auren.wishlist.v1';
type Listener = () => void;
const listeners = new Set<Listener>();
let ids: string[] | null = null;
let userId: string | null = null;
let initialised = false;
const EMPTY: string[] = [];

function readLocal(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

function get(): string[] {
  if (typeof window === 'undefined') return EMPTY;
  if (!ids) ids = readLocal();
  return ids;
}

function set(next: string[]) {
  ids = next;
  try {
    if (!userId) window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

async function init() {
  if (initialised || !isSupabaseConfigured) return;
  initialised = true;
  const supabase = getSupabaseBrowserClient();
  const sync = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) {
      ids = readLocal();
      for (const l of listeners) l();
      return;
    }
    const local = readLocal();
    if (local.length) {
      await supabase.from('wishlist_items').upsert(local.map((product_id) => ({ user_id: userId!, product_id })), { ignoreDuplicates: true });
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    }
    const { data } = await supabase.from('wishlist_items').select('product_id').order('created_at', { ascending: false });
    set((data ?? []).map((r) => r.product_id));
  };
  await sync();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void sync();
  });
}

export const wishlistStore = {
  async toggle(productId: string) {
    const current = get();
    const has = current.includes(productId);
    set(has ? current.filter((id) => id !== productId) : [productId, ...current]);
    if (userId) {
      const supabase = getSupabaseBrowserClient();
      const { error } = has
        ? await supabase.from('wishlist_items').delete().eq('product_id', productId)
        : await supabase.from('wishlist_items').insert({ user_id: userId, product_id: productId });
      if (error) set(current); // roll back on failure
    }
    return !has;
  },
};

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useWishlist() {
  useEffect(() => {
    void init();
  }, []);
  const list = useSyncExternalStore(subscribe, get, () => EMPTY);
  return { ids: list, has: (id: string) => list.includes(id), count: list.length };
}
