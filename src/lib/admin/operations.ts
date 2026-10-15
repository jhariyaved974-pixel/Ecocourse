import type { Enums } from '@/lib/database.types';

export const INVENTORY_FILTERS = [
  { value: '', label: 'All variants' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'reserved', label: 'Reserved by orders' },
  { value: 'inactive', label: 'Inactive variants' },
] as const;

/** Reasons staff may pick; 'sale' and 'cancellation' are reserved for order processing. */
export const MANUAL_INVENTORY_REASONS = [
  { value: 'restock', label: 'Restock (new delivery)' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'correction', label: 'Stock count correction' },
  { value: 'damaged', label: 'Damaged / unsellable' },
  { value: 'return', label: 'Customer return' },
] as const satisfies readonly { value: Enums<'inventory_reason'>; label: string }[];

export const INVENTORY_REASON_TEXT: Record<Enums<'inventory_reason'>, string> = {
  initial: 'Initial stock',
  restock: 'Restock',
  adjustment: 'Adjustment',
  correction: 'Correction',
  damaged: 'Damaged',
  sale: 'Sale',
  cancellation: 'Cancellation',
  return: 'Return',
  import: 'CSV import',
};

export const CUSTOMER_FILTERS = [
  { value: '', label: 'All customers' },
  { value: 'buyers', label: 'Have ordered' },
  { value: 'marketing', label: 'Marketing opt-in' },
  { value: 'blocked', label: 'Blocked' },
] as const;

export const REQUEST_TYPE_TEXT: Record<string, string> = {
  order_issue: 'Order issue',
  data_export: 'Data export',
  account_deletion: 'Account deletion',
  other: 'Other',
};

export const REQUEST_STATUS_TEXT: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

/** Quotes a value for CSV (RFC 4180) and neutralises spreadsheet formulas. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
