import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

/** Formats integer minor units (paise) as INR, e.g. 149900 -> "₹1,499". */
export function formatMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return '—';
  return paise % 100 === 0 ? inrWhole.format(paise / 100) : inrExact.format(paise / 100);
}

/** Exact rupee amount with two decimals, as used in UPI links (e.g. "1499.00"). */
export function paiseToRupeeString(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new Error('Amount must be a non-negative integer number of paise');
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

/** Parses a rupee amount typed by staff ("1,499.50") into paise. Returns null when invalid. */
export function rupeesToPaise(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const text = String(input).replace(/[,\s₹]/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function discountPercent(price: number, finalPrice: number): number {
  if (!price || finalPrice >= price) return 0;
  return Math.round(((price - finalPrice) / price) * 100);
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  return dateTimeFormat.format(new Date(value));
}

export function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** 45 → "45 minutes", 60 → "1 hour", 90 → "1.5 hours", 2880 → "2 days". */
export function formatDuration(minutes: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (minutes < 60) return plural(minutes, 'minute');
  if (minutes < 60 * 48 || minutes % (60 * 24) !== 0) return plural(Math.round((minutes / 60) * 10) / 10, 'hour');
  return plural(minutes / (60 * 24), 'day');
}
