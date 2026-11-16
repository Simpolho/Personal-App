import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from './db';
import { getUsage } from './foods';
import { createMeal } from './log';
import { deleteRecipe, listRecipes, logRecipe, recipeNutrientsPerPortion, saveRecipe } from './recipes';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T08:15:00Z'));
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379 }, servings: [], searchKey: 'oats' },
    { id: 'usda:171265', name: 'Milk', source: 'usda', basis: '100g', nutrients: { kcal: 42 }, servings: [], searchKey: 'milk' },
  ]);
});

test('per-portion nutrients and logging portions', async () => {
  const r = await saveRecipe({ name: 'Papas', items: [{ foodRef: 'usda:173904', grams: 80 }, { foodRef: 'usda:171265', grams: 250 }], servings: 2 });
  expect((await recipeNutrientsPerPortion(r)).kcal).toBeCloseTo(204.1);
  const m = await createMeal('2026-11-16');
  const e = await logRecipe(m.id, r.id, 1.5);
  expect(e).toMatchObject({ nameSnapshot: 'Papas', unit: 'portion', amount: 1.5 });
  expect(e.nutrientsSnapshot.kcal).toBeCloseTo(306.15);
  expect(await getUsage(r.id)).toMatchObject({ lastAmount: 1.5, lastUnit: 'portion' });
});
test('saving with an id updates; deleting hides it from the list', async () => {
  const r = await saveRecipe({ name: 'Papas', items: [], servings: 2 });
  const edited = await saveRecipe({ id: r.id, name: 'Papas de aveia', items: [], servings: 3 });
  expect(edited.createdAt).toBe(r.createdAt);
  expect((await listRecipes()).map((x) => [x.name, x.servings])).toEqual([['Papas de aveia', 3]]);
  await deleteRecipe(r.id);
  expect(await listRecipes()).toEqual([]);
});
