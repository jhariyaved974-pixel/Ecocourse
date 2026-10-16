// Shape of the server quote (from public.compute_quote) as used by the UI.
import { resolveMediaUrl } from '@/lib/media';

export interface QuoteLine {
  variantId: string;
  productId: string | null;
  productName: string | null;
  slug: string | null;
  sku: string | null;
  colorName: string | null;
  sizeLabel: string | null;
  /** Option name for sizeLabel ("Size", "Weight" ...). */
  variantLabel: string | null;
  image: string | null;
  quantity: number;
  available: number;
  unitPrice: number | null;
  regularPrice: number | null;
  lineTotal: number;
  status: 'ok' | 'unavailable' | 'out_of_stock' | 'insufficient_stock' | 'max_quantity' | 'invalid_quantity';
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  coupon: { code: string; description: string | null; amount: number; errorCode: string | null; errorData: Record<string, number> } | null;
  shipping: { code: string; name: string; fee: number; freeOver: number | null; minDays: number; maxDays: number } | null;
  shippingOptions: { code: string; name: string; description: string; fee: number; baseFee: number; freeOver: number | null; minDays: number; maxDays: number }[];
  tax: { enabled: boolean; inclusive: boolean; label: string; amount: number };
  total: number;
  /** Current advance percentage for Half prepaid (payment_settings.advance_percent). */
  advancePercent: number;
  /** What a Half prepaid checkout charges now (rounded up to a whole rupee) and before dispatch. */
  halfPrepaidAdvance: number;
  halfPrepaidBalance: number;
  /** False when the total is 0 or the balance would be 0 (the order is then prepaid). */
  halfPrepaidAvailable: boolean;
  itemCount: number;
  errors: { code: string; variantId?: string; available?: number }[];
  isValid: boolean;
}

type Raw = Record<string, unknown> | null;

export function mapQuote(raw: unknown): Quote {
  const q = (raw ?? {}) as Record<string, unknown>;
  const lines = (Array.isArray(q.lines) ? q.lines : []) as Record<string, unknown>[];
  const coupon = q.coupon as Raw;
  const shipping = q.shipping as Raw;
  const tax = (q.tax ?? {}) as Record<string, unknown>;
  return {
    lines: lines.map((l) => ({
      variantId: String(l.variant_id),
      productId: (l.product_id as string) ?? null,
      productName: (l.product_name as string) ?? null,
      slug: (l.slug as string) ?? null,
      sku: (l.sku as string) ?? null,
      colorName: (l.color_name as string) ?? null,
      sizeLabel: (l.size_label as string) ?? null,
      variantLabel: (l.variant_label as string) ?? null,
      image: resolveMediaUrl(l.image as string | null),
      quantity: Number(l.quantity ?? 0),
      available: Number(l.available ?? 0),
      unitPrice: l.unit_price === null || l.unit_price === undefined ? null : Number(l.unit_price),
      regularPrice: l.regular_price === null || l.regular_price === undefined ? null : Number(l.regular_price),
      lineTotal: Number(l.line_total ?? 0),
      status: (l.status as QuoteLine['status']) ?? 'unavailable',
    })),
    subtotal: Number(q.subtotal ?? 0),
    discount: Number(q.discount ?? 0),
    coupon: coupon
      ? {
          code: String(coupon.code),
          description: (coupon.description as string) ?? null,
          amount: Number(coupon.amount ?? 0),
          errorCode: (coupon.error_code as string) ?? null,
          errorData: (coupon.error_data as Record<string, number>) ?? {},
        }
      : null,
    shipping: shipping
      ? {
          code: String(shipping.code),
          name: String(shipping.name),
          fee: Number(shipping.fee ?? 0),
          freeOver: shipping.free_over === null || shipping.free_over === undefined ? null : Number(shipping.free_over),
          minDays: Number(shipping.min_days ?? 0),
          maxDays: Number(shipping.max_days ?? 0),
        }
      : null,
    shippingOptions: ((Array.isArray(q.shipping_options) ? q.shipping_options : []) as Record<string, unknown>[]).map((o) => ({
      code: String(o.code),
      name: String(o.name),
      description: String(o.description ?? ''),
      fee: Number(o.fee ?? 0),
      baseFee: Number(o.base_fee ?? 0),
      freeOver: o.free_over === null || o.free_over === undefined ? null : Number(o.free_over),
      minDays: Number(o.min_days ?? 0),
      maxDays: Number(o.max_days ?? 0),
    })),
    tax: { enabled: Boolean(tax.enabled), inclusive: tax.inclusive !== false, label: String(tax.label ?? 'GST'), amount: Number(tax.amount ?? 0) },
    total: Number(q.total ?? 0),
    advancePercent: Number(q.advance_percent ?? 0),
    halfPrepaidAdvance: Number(q.half_prepaid_advance ?? 0),
    halfPrepaidBalance: Number(q.half_prepaid_balance ?? 0),
    halfPrepaidAvailable: q.half_prepaid_available === true && Number(q.half_prepaid_balance ?? 0) > 0,
    itemCount: Number(q.item_count ?? 0),
    errors: (Array.isArray(q.errors) ? q.errors : []) as Quote['errors'],
    isValid: q.is_valid === true,
  };
}

export function couponErrorMessage(code: string | null, data: Record<string, number> = {}, format: (n: number) => string = String): string | null {
  switch (code) {
    case null:
    case undefined:
      return null;
    case 'invalid':
      return 'This coupon code is not valid.';
    case 'not_started':
      return 'This coupon is not active yet.';
    case 'expired':
      return 'This coupon has expired.';
    case 'min_subtotal':
      return `Add ${format(data.shortfall ?? 0)} more to use this coupon (minimum ${format(data.min_subtotal ?? 0)}).`;
    case 'usage_limit':
      return 'This coupon has been fully redeemed.';
    case 'per_customer_limit':
      return 'You have already used this coupon.';
    case 'first_order_only':
      return 'This coupon is only valid on your first order.';
    case 'not_applicable':
      return 'This coupon does not apply to the items in your cart.';
    default:
      return 'This coupon cannot be applied.';
  }
}

export function lineStatusMessage(line: Pick<QuoteLine, 'status' | 'available'>): string | null {
  switch (line.status) {
    case 'ok':
      return null;
    case 'out_of_stock':
      return 'Sold out.';
    case 'insufficient_stock':
      return `Only ${line.available} left — reduce the quantity.`;
    case 'max_quantity':
      return 'Maximum 10 per item.';
    case 'unavailable':
      return 'No longer available.';
    default:
      return 'Unavailable.';
  }
}
