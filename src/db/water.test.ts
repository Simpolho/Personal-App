import { beforeEach, expect, test } from 'vitest';
import { resetDb } from './db';
import { addWater, getWaterSettings, setWaterSettings, undoWater, WATER_DEFAULTS, waterTotal } from './water';

beforeEach(() => resetDb());

test('water adds up per day, and Undo removes the last tap', async () => {
  await addWater('2026-11-23', 250);
  await addWater('2026-11-23', 500);
  await addWater('2026-11-23', 250);
  expect(await waterTotal('2026-11-23')).toBe(1000);
  expect(await undoWater('2026-11-23')).toBe(true);
  expect(await waterTotal('2026-11-23')).toBe(750);
  expect(await undoWater('2026-11-23')).toBe(true);
  expect(await waterTotal('2026-11-23')).toBe(250);
});
test('Undo only touches that day, and does nothing when there is no water', async () => {
  await addWater('2026-11-22', 500);
  expect(await undoWater('2026-11-23')).toBe(false);
  expect(await waterTotal('2026-11-22')).toBe(500);
});
test('water settings start at the defaults and can be changed', async () => {
  expect(await getWaterSettings()).toEqual(WATER_DEFAULTS);
  expect(WATER_DEFAULTS).toEqual({ targetMl: 2000, smallMl: 250, largeMl: 500 });
  await setWaterSettings({ targetMl: 2500, smallMl: 330, largeMl: 750 });
  expect(await getWaterSettings()).toEqual({ targetMl: 2500, smallMl: 330, largeMl: 750 });
});
