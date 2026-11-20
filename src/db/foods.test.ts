import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from './db';
import {
  deleteFood,
  duplicateFood,
  findFoodByBarcode,
  getFood,
  getUsage,
  isTableRef,
  listFoods,
  recordUsage,
  saveFood,
  setFavourite,
} from './foods';
import type { TableFood } from './types';

beforeEach(() => resetDb());

const oats: TableFood = {
  id: 'usda:173904',
  name: 'Oats',
  source: 'usda',
  basis: '100g',
  nutrients: { kcal: 379, protein: 13.2 },
  servings: [{ label: '1 cup', grams: 81 }],
  searchKey: 'oats',
};

test('saveFood creates a custom food with record fields', async () => {
  const f = await saveFood({ name: 'Granola caseira', basis: '100g', nutrients: { kcal: 450 }, servings: [] });
  expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(f.source).toBe('custom');
  expect(f.createdAt).toBe(f.updatedAt);
  expect(await getFood(f.id)).toEqual(f);
});
test('saveFood with an id updates and keeps createdAt', async () => {
  const f = await saveFood({ name: 'A', basis: '100g', nutrients: {}, servings: [] });
  vi.setSystemTime(new Date(Date.now() + 1000));
  const g = await saveFood({ ...f, name: 'B' });
  expect(g.createdAt).toBe(f.createdAt);
  expect(g.updatedAt > f.updatedAt).toBe(true);
});
test('getFood resolves table refs', async () => {
  await db.tableFoods.put(oats);
  expect(isTableRef('usda:173904')).toBe(true);
  expect(await getFood('usda:173904')).toEqual(oats);
});
test('duplicateFood copies a table food into an editable custom food', async () => {
  await db.tableFoods.put(oats);
  const copy = await duplicateFood('usda:173904');
  expect(copy).toMatchObject({ name: 'Oats', source: 'custom', basis: '100g', nutrients: oats.nutrients, servings: oats.servings });
  expect(copy.id).not.toBe(oats.id);
  expect(await getFood('usda:173904')).toEqual(oats);
});
test('deleteFood hides it from lists but keeps it resolvable', async () => {
  const f = await saveFood({ name: 'X', basis: '100g', nutrients: {}, servings: [] });
  await deleteFood(f.id);
  expect(await listFoods()).toEqual([]);
  expect(await getFood(f.id)).toMatchObject({ deletedAt: expect.any(String) });
});
test('recordUsage and setFavourite upsert one usage record per food', async () => {
  await recordUsage('usda:173904', 80, 'g');
  await recordUsage('usda:173904', 60, 'g');
  await setFavourite('usda:173904', true);
  expect(await getUsage('usda:173904')).toMatchObject({ id: 'usda:173904', lastAmount: 60, lastUnit: 'g', favourite: true });
  expect(await db.foodUsage.count()).toBe(1);
});
test('findFoodByBarcode finds the live food, the most recently changed one, in any barcode form', async () => {
  const old = await saveFood({ name: 'Old', barcode: '0049000050103', basis: '100g', nutrients: {}, servings: [] });
  vi.setSystemTime(new Date(Date.now() + 1000));
  const newer = await saveFood({ name: 'Newer', barcode: '0049000050103', basis: '100g', nutrients: {}, servings: [] });
  expect((await findFoodByBarcode('049000050103'))?.id).toBe(newer.id);
  await deleteFood(newer.id);
  expect((await findFoodByBarcode('0049000050103'))?.id).toBe(old.id);
  expect(await findFoodByBarcode('3017624010701')).toBeUndefined();
  expect(await findFoodByBarcode('not a code')).toBeUndefined();
});
