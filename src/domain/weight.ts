import { addDays } from './dates';
import { parseAmount } from './nutrients';

type Weighing = { date: string; kg: number };

/** A typed weight: 20–300 kg with at most 2 decimals; a decimal comma is fine. */
export function parseWeight(input: string): number | null {
  const kg = parseAmount(input);
  if (kg === null || kg < 20 || kg > 300) return null;
  const decimals = input.trim().replace(',', '.').split('.')[1] ?? '';
  return decimals.length <= 2 ? kg : null;
}

export function formatKg(kg: number): string {
  return kg.toFixed(2);
}

/** "+0.25", "−0.40" (a real minus sign), "0.00". */
export function formatChange(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  if (rounded === 0) return '0.00';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(2)}`;
}

/** Mean of the weigh-ins in the 7 days ending on `endDate` (days without one are skipped). */
export function average7(weights: Weighing[], endDate: string): number | null {
  const start = addDays(endDate, -6);
  const inWeek = weights.filter((w) => w.date >= start && w.date <= endDate);
  if (inWeek.length === 0) return null;
  return inWeek.reduce((sum, w) => sum + w.kg, 0) / inWeek.length;
}

/** This week's average minus last week's; null unless both weeks have a weigh-in. */
export function weeklyChange(weights: Weighing[], endDate: string): number | null {
  const now = average7(weights, endDate);
  const before = average7(weights, addDays(endDate, -7));
  return now === null || before === null ? null : now - before;
}

/** One point per day, oldest first, for the chart's average line. */
export function averageSeries(weights: Weighing[], endDate: string, days = 30): { date: string; avg: number | null }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(endDate, i - days + 1);
    return { date, avg: average7(weights, date) };
  });
}
