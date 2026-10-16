// Variant option helpers shared by the product page, cart, checkout and order
// pages. `product_variants.size_label` holds the option value; the product's
// `variant_label` names the option ("Size", "Strap size", "Weight" ...). A
// single 'Standard' value means the product has no options.

export const STANDARD_OPTION = 'Standard';
export const DEFAULT_VARIANT_LABEL = 'Size';

export function isStandardOption(value: string | null | undefined): boolean {
  return !value || value.trim().toLowerCase() === STANDARD_OPTION.toLowerCase();
}

/** "Weight: 2 × 3 kg", or null for products without options. Old carts without a label read as "Size". */
export function optionText(label: string | null | undefined, value: string | null | undefined): string | null {
  if (isStandardOption(value)) return null;
  return `${label?.trim() || DEFAULT_VARIANT_LABEL}: ${value!.trim()}`;
}

/** Colour and option for a cart or order line, e.g. "Black · Strap size: S/M". */
export function lineDetails(parts: { colorName?: string | null; variantLabel?: string | null; sizeLabel?: string | null }): string {
  return [parts.colorName, optionText(parts.variantLabel, parts.sizeLabel)].filter(Boolean).join(' · ');
}

/** True when every value is 'Standard' (nothing to pick). */
export function hasNoOptions(values: string[]): boolean {
  return values.length > 0 && values.every((v) => isStandardOption(v));
}

/**
 * Footwear sizes are stored as "UK 6"; when every value shares that prefix the
 * picker shows "6" and says the sizes are UK/India once.
 */
export function ukSizes(values: string[]): boolean {
  return values.length > 0 && values.every((v) => /^UK\s*\d/i.test(v));
}

export function shortOptionValue(value: string, stripUk: boolean): string {
  return stripUk ? value.replace(/^UK\s*/i, '') : value;
}

/** "a size", "an option" for sentences such as "Please select a size." */
export function withArticle(label: string): string {
  const lower = label.trim().toLowerCase() || DEFAULT_VARIANT_LABEL.toLowerCase();
  return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
}
