/** At most two decimals, no trailing zeros: 80, 80.5, 1.33. */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "80 g", "1 medium", "2 × 1 medium", "1.5 portions"; empty for a quick add. */
export function describeAmount(amount: number, unit: string): string {
  if (unit === 'quick') return '';
  if (unit === 'g' || unit === 'ml') return `${formatNumber(amount)} ${unit}`;
  if (unit === 'portion') return `${formatNumber(amount)} ${amount === 1 ? 'portion' : 'portions'}`;
  return amount === 1 ? unit : `${formatNumber(amount)} × ${unit}`;
}

/** Whole number for totals at a glance ("120 / 160 g"); never "-0". */
export function formatWhole(n: number): string {
  return String(Math.round(n) || 0);
}
