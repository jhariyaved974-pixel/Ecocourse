'use client';

import { useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { isSupabaseConfigured } from '@/lib/env';
import { cartStore } from '@/lib/cart/store';
import { getSavedCart } from '@/app/(store)/actions';

// Signed-in shoppers' carts are saved to their account (RLS: own rows only) so
// they follow them across devices; the saved cart also powers the opt-in cart
// reminder email. Guests' carts never leave the browser.

let started = false;

function start() {
  if (started || !isSupabaseConfigured) return;
  started = true;
  const supabase = getSupabaseBrowserClient();
  let userId: string | null = null;
  let lastSent: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const push = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!userId) return;
      const lines = cartStore.get().map((l) => ({ variant_id: l.variantId, quantity: l.quantity }));
      const key = JSON.stringify(lines);
      if (key === lastSent) return;
      const { error } = await supabase.rpc('sync_my_cart', { p_lines: lines });
      if (!error) lastSent = key;
    }, 1200);
  };

  const onAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const previous = userId;
    userId = user?.id ?? null;
    if (!userId || userId === previous) return;
    lastSent = null;
    // On a fresh device the local cart is empty: restore the saved one.
    // Otherwise the cart in this browser wins and replaces the saved cart.
    if (cartStore.get().length === 0) {
      const saved = await getSavedCart().catch(() => []);
      if (saved.length && cartStore.get().length === 0) {
        cartStore.replace(saved);
        lastSent = JSON.stringify(saved.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })));
        return;
      }
    }
    push();
  };

  cartStore.subscribe(push);
  void onAuth();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void onAuth();
  });
}

/** Mount once in the storefront (the cart drawer is always present). */
export function useCartSync() {
  useEffect(() => {
    start();
  }, []);
}
