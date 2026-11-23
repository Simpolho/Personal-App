import { nowIso } from '../domain/dates';
import { db } from './db';
import { isLive, newRecord, softDeleted } from './records';
import type { Settings, WaterEntry } from './types';

export type WaterSettings = { targetMl: number; smallMl: number; largeMl: number };

export const WATER_DEFAULTS: WaterSettings = { targetMl: 2000, smallMl: 250, largeMl: 500 };

/** One tap of a water button. */
export async function addWater(date: string, ml: number): Promise<WaterEntry> {
  const entry: WaterEntry = newRecord({ date, ml });
  await db.water.add(entry);
  return entry;
}

async function liveWater(date: string): Promise<WaterEntry[]> {
  return (await db.water.where('date').equals(date).toArray()).filter(isLive);
}

/** Removes the last tap of that day. False when there was nothing to remove. */
export async function undoWater(date: string): Promise<boolean> {
  const entries = await liveWater(date);
  if (entries.length === 0) return false;
  const last = entries.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  await db.water.put(softDeleted(last));
  return true;
}

export async function waterTotal(date: string): Promise<number> {
  return (await liveWater(date)).reduce((sum, e) => sum + e.ml, 0);
}

export async function getWaterSettings(): Promise<WaterSettings> {
  const s = await db.settings.get('settings');
  return {
    targetMl: s?.waterTargetMl ?? WATER_DEFAULTS.targetMl,
    smallMl: s?.waterSmallMl ?? WATER_DEFAULTS.smallMl,
    largeMl: s?.waterLargeMl ?? WATER_DEFAULTS.largeMl,
  };
}

export async function setWaterSettings(water: WaterSettings): Promise<void> {
  const existing = await db.settings.get('settings');
  const now = nowIso();
  const settings: Settings = {
    ...existing,
    id: 'settings',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    waterTargetMl: water.targetMl,
    waterSmallMl: water.smallMl,
    waterLargeMl: water.largeMl,
  };
  await db.settings.put(settings);
}
