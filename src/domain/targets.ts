import type { DayKind, Routine, Targets } from '../db/types';
import type { Nutrients } from './nutrients';
import { routinesForDate } from './workouts';

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

export interface TargetSets {
  main: TargetValues;
  rest: TargetValues;
}

/**
 * Both sets of the targets in force on a date: the latest live record with
 * `effectiveFrom <= date`. Null when there is none.
 */
export function targetSetsFor(date: string, list: Targets[]): TargetSets | null {
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
  return { main: cleanTargets(current), rest: cleanTargets(current.rest ?? {}) };
}

/** True when a Rest day set has a value, so the Training day / Rest day switch matters. */
export function hasRestSet(sets: TargetSets | null): boolean {
  return sets !== null && Object.keys(sets.rest).length > 0;
}

/**
 * The set that applies on a kind of day. With no Rest day values, every day uses the main set.
 * Null when there are no sets, or the chosen one has no values.
 */
export function pickTargets(sets: TargetSets | null, kind: DayKind): TargetValues | null {
  if (!sets) return null;
  const values = kind === 'rest' && hasRestSet(sets) ? sets.rest : sets.main;
  return Object.keys(values).length > 0 ? values : null;
}

/** Targets in force on a date for a kind of day, taken as a whole set. */
export function targetsFor(date: string, list: Targets[], kind: DayKind = 'training'): TargetValues | null {
  return pickTargets(targetSetsFor(date, list), kind);
}

/** The user's choice for the day if there is one; otherwise a routine planned that weekday makes it a training day. */
export function dayKindFor(saved: DayKind | undefined, routines: Routine[], date: string): DayKind {
  if (saved) return saved;
  return routinesForDate(routines, date).length > 0 ? 'training' : 'rest';
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
