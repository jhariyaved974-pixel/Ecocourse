'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { ROLE_GROUPS } from '@/lib/auth';
import { dbFail, staffAction } from '@/lib/admin/action';
import { fail, ok, sqlNull } from '@/lib/errors';
import { TAGS } from '@/lib/catalog/queries';

const reason = z.enum(['restock', 'adjustment', 'correction', 'damaged', 'return']);
const note = z.string().trim().max(300).optional();

const adjustSchema = z.object({ variantId: z.uuid(), delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, 'Enter a non-zero change.'), reason, note });
const setSchema = z.object({ variantId: z.uuid(), onHand: z.number().int().min(0).max(1000000), reason, note });

export async function adjustStock(input: z.input<typeof adjustSchema>) {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = adjustSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { data, error } = await supabase.rpc('adjust_stock', {
      p_variant_id: parsed.data.variantId,
      p_delta: parsed.data.delta,
      p_reason: parsed.data.reason,
      p_note: sqlNull(parsed.data.note || null),
    });
    if (error) return dbFail(error);
    updateTag(TAGS.catalog);
    return ok(data as { stock_on_hand: number }, 'Stock updated');
  });
}

export async function setStock(input: z.input<typeof setSchema>) {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = setSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { data, error } = await supabase.rpc('set_stock', {
      p_variant_id: parsed.data.variantId,
      p_on_hand: parsed.data.onHand,
      p_reason: parsed.data.reason,
      p_note: sqlNull(parsed.data.note || null),
    });
    if (error) return dbFail(error);
    updateTag(TAGS.catalog);
    return ok(data as { stock_on_hand: number }, 'Stock set');
  });
}

export interface MovementRow {
  id: number;
  delta: number;
  reason: string;
  note: string | null;
  onHandAfter: number;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
}

export async function listMovements(variantId: string) {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    if (!z.uuid().safeParse(variantId).success) return fail('Invalid variant.');
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('id, quantity_delta, reason, note, on_hand_after, order_id, created_at, order:orders(order_number)')
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return dbFail(error);
    return ok(
      (data ?? []).map((m): MovementRow => ({
        id: m.id,
        delta: m.quantity_delta,
        reason: m.reason,
        note: m.note,
        onHandAfter: m.on_hand_after,
        orderId: m.order_id,
        orderNumber: m.order?.order_number ?? null,
        createdAt: m.created_at,
      })),
    );
  });
}

const importSchema = z.object({
  mode: z.enum(['set', 'add']),
  dryRun: z.boolean(),
  rows: z.array(z.object({ sku: z.string().trim().max(60), quantity: z.string().trim().max(12) })).min(1, 'The file has no rows.').max(5000, 'Import at most 5,000 rows at a time.'),
});

export interface ImportResult {
  applied: boolean;
  errors: { row: number; sku: string; message: string }[];
  changes: { sku: string; from: number; to: number }[];
}

export async function importInventory(input: z.input<typeof importSchema>) {
  return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { data, error } = await supabase.rpc('import_inventory', {
      p_rows: parsed.data.rows,
      p_mode: parsed.data.mode,
      p_dry_run: parsed.data.dryRun,
    });
    if (error) return dbFail(error);
    const result = data as unknown as ImportResult;
    if (result.applied) updateTag(TAGS.catalog);
    return ok(result, result.applied ? `Updated ${result.changes.length} variant(s)` : undefined);
  });
}
