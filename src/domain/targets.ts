import type { Targets } from '../db/types';
import type { Nutrients } from './nutrients';

export const TARGET_KEYS = ['kcal', 'protein', 'carbs', 'fat'] as const;
export type TargetKey = (typeof TARGET_KEYS)[number];
export type TargetValues = Partial<Record<TargetKey, number>>;

/** Keeps only targets that are real positive numbers; anything else counts as "not set". */
export function cleanTargets(values: TargetValues): TargetValues {
  const out: TargetValues = {};
  for (const key of TARGET_KEYS) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[key] = value;
  }
  return out;
}

/**
 * Targets in force on a date: the latest live record with `effectiveFrom <= date`, taken as a
 * whole set. Returns null when there is none, or when that record sets no values.
 */
export function targetsFor(date: string, list: Targets[]): TargetValues | null {
  let current: Targets | undefined;
  for (const record of list) {
    if (record.deletedAt || record.effectiveFrom > date) continue;
    if (
      !current ||
      record.effectiveFrom > current.effectiveFrom ||
      (record.effectiveFrom === current.effectiveFrom && record.updatedAt > current.updatedAt)
    ) {
      current = record;
    }
  }
  if (!current) return null;
  const values = cleanTargets(current);
  return Object.keys(values).length > 0 ? values : null;
}

/** What is left of each set target. Missing totals count as 0; the result can be negative. */
export function remaining(targets: TargetValues, totals: Nutrients): TargetValues {
  const out: TargetValues = {};
  for (const key of TARGET_KEYS) {
    const target = targets[key];
    if (target !== undefined) out[key] = target - (totals[key] ?? 0);
  }
  return out;
}
