import { nowIso } from '../domain/dates';
import { cleanTargets, targetsFor, type TargetValues } from '../domain/targets';
import { db } from './db';
import { isLive } from './records';
import type { Targets } from './types';

export async function listTargets(): Promise<Targets[]> {
  return (await db.targets.orderBy('effectiveFrom').toArray()).filter(isLive);
}

/**
 * Sets the targets that apply from `effectiveFrom` onwards. Days before it keep the targets
 * they had. Setting twice for the same day replaces that day's record.
 */
export async function setTargets(effectiveFrom: string, values: TargetValues): Promise<Targets> {
  const existing = (await listTargets()).find((t) => t.effectiveFrom === effectiveFrom);
  const now = nowIso();
  const record: Targets = {
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    effectiveFrom,
    ...cleanTargets(values),
  };
  await db.targets.put(record);
  return record;
}

export async function getTargetsFor(date: string): Promise<TargetValues | null> {
  return targetsFor(date, await listTargets());
}
