import { nowIso } from '../domain/dates';
import { db } from './db';
import { isLive, softDeleted } from './records';
import type { WeightEntry } from './types';

/** Logs the weight for a day. One per day: logging the same day again replaces it. */
export async function logWeight(date: string, kg: number): Promise<WeightEntry> {
  const existing = await db.weights.get(date);
  const now = nowIso();
  const entry: WeightEntry = { id: date, date, kg, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.weights.put(entry);
  return entry;
}

export async function deleteWeight(date: string): Promise<void> {
  const existing = await db.weights.get(date);
  if (existing && isLive(existing)) await db.weights.put(softDeleted(existing));
}

/** Every weigh-in still in the log, oldest first. */
export async function listWeights(): Promise<WeightEntry[]> {
  return (await db.weights.orderBy('date').toArray()).filter(isLive);
}
