import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Sale } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Money convention (Phase 1.3): every money field stored or computed in the app
 * is an INTEGER number of cents (KES × 100). Float arithmetic never touches the
 * books; conversion to/from shillings happens only at the UI boundary.
 */
export const CENTS_PER_KES = 100;

/** KES (possibly fractional) → integer cents, rounded to the nearest cent. */
export function kesToCents(kes: number | string): number {
  const n = typeof kes === 'string' ? parseFloat(kes) : kes;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * CENTS_PER_KES);
}

/** Integer cents → KES as a number (for display and exports). */
export function centsToKes(cents: number): number {
  return cents / CENTS_PER_KES;
}

/** Integer cents → formatted KES string. */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(centsToKes(cents));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/** Sales that count toward money totals: everything except voided ones. */
export function activeSales(sales: Sale[]): Sale[] {
  return sales.filter(s => s.status !== 'voided');
}
