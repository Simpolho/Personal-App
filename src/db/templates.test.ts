import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from './db';
import { createMeal, getDay, logFood, quickAdd } from './log';
import { applyTemplate, deleteTemplate, listTemplates, saveMealAsTemplate } from './templates';
import { getDayTargets } from './targets';
import { saveRoutine } from './workouts';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T08:15:00Z'));
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379 }, servings: [], searchKey: 'oats' },
    { id: 'usda:171265', name: 'Milk', source: 'usda', basis: '100g', nutrients: { kcal: 42 }, servings: [], searchKey: 'milk' },
  ]);
});

test('save a meal as a template and repeat it on another day', async () => {
  const m = await createMeal('2026-11-16');
  await logFood(m.id, 'usda:173904', 80, 'g');
  await quickAdd(m.id, 'Coffee', { kcal: 5 });
  const t = await saveMealAsTemplate(m.id, 'Usual breakfast');
  expect(t.items).toEqual([
    { kind: 'food', foodRef: 'usda:173904', amount: 80, unit: 'g' },
    { kind: 'quick', name: 'Coffee', nutrients: { kcal: 5 } },
  ]);
  vi.setSystemTime(new Date('2026-11-17T07:40:00Z'));
  const copy = await applyTemplate(t.id, '2026-11-17');
  expect(copy).toMatchObject({ name: 'Usual breakfast', date: '2026-11-17', time: '07:40' });
  const day = await getDay('2026-11-17');
  expect(day.totals.kcal).toBeCloseTo(308.2);
  expect(day.meals[0].entries.map((e) => e.nameSnapshot)).toEqual(['Oats', 'Coffee']);
});
test('deleted templates are not listed', async () => {
  const m = await createMeal('2026-11-16');
  const t = await saveMealAsTemplate(m.id, 'Empty');
  expect((await listTemplates()).map((x) => x.name)).toEqual(['Empty']);
  await deleteTemplate(t.id);
  expect(await listTemplates()).toEqual([]);
});
test('a template that cannot be fully repeated adds nothing', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, 'Coffee', { kcal: 5 });
  await logFood(m.id, 'usda:173904', 80, 'g');
  const t = await saveMealAsTemplate(m.id, 'Breakfast');
  await db.tableFoods.delete('usda:173904'); // e.g. a table update dropped the food
  await expect(applyTemplate(t.id, '2026-11-17')).rejects.toThrow();
  expect((await getDay('2026-11-17')).meals).toEqual([]);
});
test('a day filled from a saved meal keeps its kind when the weekly plan changes later', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, 'Coffee', { kcal: 5 });
  const t = await saveMealAsTemplate(m.id, 'Usual breakfast');
  const lower = await saveRoutine({ name: 'Lower', weekdays: [2], items: [] });
  await applyTemplate(t.id, '2026-11-17');
  await saveRoutine({ name: 'Lower', weekdays: [4], items: [] }, lower.id);
  expect((await getDayTargets('2026-11-17')).kind).toBe('training');
});
