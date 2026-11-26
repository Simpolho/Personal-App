import { nowIso } from '../domain/dates';
import {
  cleanTargets,
  dayKindFor,
  hasRestSet,
  pickTargets,
  targetSetsFor,
  type TargetSets,
  type TargetValues,
} from '../domain/targets';
import { db } from './db';
import { isLive } from './records';
import type { DayKind, Targets } from './types';
import { listRoutines } from './workouts';

export async function listTargets(): Promise<Targets[]> {
  return (await db.targets.orderBy('effectiveFrom').toArray()).filter(isLive);
}

/**
 * Sets the targets that apply from `effectiveFrom` onwards: `values` for training days (or every
 * day) and `rest` for rest days. Days before it keep the targets they had. Setting twice for the
 * same day replaces that day's record.
 */
export async function setTargets(effectiveFrom: string, values: TargetValues, rest: TargetValues = {}): Promise<Targets> {
  const existing = (await listTargets()).find((t) => t.effectiveFrom === effectiveFrom);
  const now = nowIso();
  const restValues = cleanTargets(rest);
  const record: Targets = {
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    effectiveFrom,
    ...cleanTargets(values),
    ...(Object.keys(restValues).length > 0 ? { rest: restValues } : {}),
  };
  await db.targets.put(record);
  return record;
}

/** Both sets of the targets in force on a date, for the Settings form. */
export async function getTargetSetsFor(date: string): Promise<TargetSets | null> {
  return targetSetsFor(date, await listTargets());
}

export interface DayTargets {
  /** The set that applies on this day, or null for no targets. */
  targets: TargetValues | null;
  kind: DayKind;
  /** True when there are Rest day targets, so the Training day / Rest day switch shows. */
  split: boolean;
}

export async function getDayTargets(date: string): Promise<DayTargets> {
  const [list, day, routines] = await Promise.all([listTargets(), db.days.get(date), listRoutines()]);
  const sets = targetSetsFor(date, list);
  const kind = dayKindFor(day && isLive(day) ? day.kind : undefined, routines, date);
  return { targets: pickTargets(sets, kind), kind, split: hasRestSet(sets) };
}

/** The targets that apply on a date, for its kind of day. */
export async function getTargetsFor(date: string): Promise<TargetValues | null> {
  return (await getDayTargets(date)).targets;
}
