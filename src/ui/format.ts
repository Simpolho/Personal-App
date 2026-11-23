import type { Nutrients } from '../domain/nutrients';
import { remaining, type TargetValues } from '../domain/targets';

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

/**
 * "Left after this: 1921 kcal · 120 g protein": what remains of the day's targets once the
 * amount on screen is added. Only the targets that are set are listed; null when there are none.
 */
export function leftAfterText(targets: TargetValues | null, totalsAfter: Nutrients): string | null {
  if (!targets) return null;
  const left = remaining(targets, totalsAfter);
  const parts: string[] = [];
  if (left.kcal !== undefined) parts.push(`${formatWhole(left.kcal)} kcal`);
  if (left.protein !== undefined) parts.push(`${formatWhole(left.protein)} g protein`);
  if (left.carbs !== undefined) parts.push(`${formatWhole(left.carbs)} g carbs`);
  if (left.fat !== undefined) parts.push(`${formatWhole(left.fat)} g fat`);
  return parts.length > 0 ? `Left after this: ${parts.join(' · ')}` : null;
}

/** Litres with up to 2 decimals and no trailing zeros: 1250 → "1.25", 2000 → "2", 500 → "0.5". */
export function formatLitres(ml: number): string {
  return String(Math.round(ml / 10) / 100);
}
