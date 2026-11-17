import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from './db';
import { deleteFood, getUsage, saveFood } from './foods';
import {
  createMeal,
  deleteEntry,
  deleteMeal,
  firstEntryAt,
  getDay,
  logFood,
  nextMealName,
  pastMealNames,
  quickAdd,
  removeEmptyMeals,
  renameMeal,
  setDayComplete,
  setMealTime,
  updateEntryAmount,
  updateQuickAdd,
} from './log';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T08:15:00Z')); // 08:15 Lisbon (UTC+0 in November)
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379, protein: 13.2 }, servings: [], searchKey: 'oats' },
    { id: 'usda:173944', name: 'Banana', source: 'usda', basis: '100g', nutrients: { kcal: 89 }, servings: [{ label: '1 medium', grams: 118 }], searchKey: 'banana' },
  ]);
});

test('nextMealName counts past the highest "Meal N"', () => {
  expect(nextMealName([])).toBe('Meal 1');
  expect(nextMealName(['Meal 1', 'Pre-workout', 'Meal 3'])).toBe('Meal 4');
});
test('createMeal names and times the meal', async () => {
  expect(await createMeal('2026-11-16')).toMatchObject({ date: '2026-11-16', name: 'Meal 1', time: '08:15' });
  expect((await createMeal('2026-11-16')).name).toBe('Meal 2');
});
test('a meal created at 00:30 belongs to the date on screen', async () => {
  vi.setSystemTime(new Date('2026-07-01T23:30:00Z')); // 00:30 on 2 July in Lisbon
  expect(await createMeal('2026-07-01')).toMatchObject({ date: '2026-07-01', time: '00:30' });
});
test('logFood snapshots nutrients and remembers the amount', async () => {
  const m = await createMeal('2026-11-16');
  const e = await logFood(m.id, 'usda:173904', 80, 'g');
  expect(e.nameSnapshot).toBe('Oats');
  expect(e.nutrientsSnapshot.kcal).toBeCloseTo(303.2);
  expect(e.nutrientsSnapshot.protein).toBeCloseTo(10.56);
  expect(await getUsage('usda:173904')).toMatchObject({ lastAmount: 80, lastUnit: 'g' });
});
test('logFood converts servings', async () => {
  const m = await createMeal('2026-11-16');
  expect((await logFood(m.id, 'usda:173944', 1, '1 medium')).nutrientsSnapshot.kcal).toBeCloseTo(105.02);
});
test('logFood adds the brand to the name', async () => {
  const f = await saveFood({ name: 'Iogurte', brand: 'Marca', basis: '100g', nutrients: { kcal: 60 }, servings: [] });
  const m = await createMeal('2026-11-16');
  expect((await logFood(m.id, f.id, 125, 'g')).nameSnapshot).toBe('Iogurte, Marca');
});
test('editing or deleting a food later does not change past entries', async () => {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  await logFood(m.id, f.id, 100, 'g');
  await saveFood({ ...f, name: 'Pão novo', nutrients: { kcal: 999 } });
  await deleteFood(f.id);
  const day = await getDay('2026-11-16');
  expect(day.meals[0].entries[0]).toMatchObject({ nameSnapshot: 'Pão', nutrientsSnapshot: { kcal: 250 } });
});
test('updateEntryAmount scales the snapshot without re-reading the food', async () => {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  const e = await logFood(m.id, f.id, 100, 'g');
  await saveFood({ ...f, nutrients: { kcal: 999 } });
  expect((await updateEntryAmount(e.id, 40, 'g')).nutrientsSnapshot.kcal).toBeCloseTo(100);
});
test('updateEntryAmount can switch between grams and a serving', async () => {
  const m = await createMeal('2026-11-16');
  const e = await logFood(m.id, 'usda:173944', 59, 'g'); // half a medium banana
  const edited = await updateEntryAmount(e.id, 1, '1 medium');
  expect(edited).toMatchObject({ amount: 1, unit: '1 medium' });
  expect(edited.nutrientsSnapshot.kcal).toBeCloseTo(105.02);
});
test('quickAdd has no food and a default name', async () => {
  const m = await createMeal('2026-11-16');
  expect(await quickAdd(m.id, undefined, { kcal: 650, protein: 30 }))
    .toMatchObject({ nameSnapshot: 'Quick add', foodRef: undefined, nutrientsSnapshot: { kcal: 650, protein: 30 } });
});
test('updateQuickAdd replaces the name and numbers', async () => {
  const m = await createMeal('2026-11-16');
  const e = await quickAdd(m.id, undefined, { kcal: 650 });
  expect(await updateQuickAdd(e.id, 'Lunch out', { kcal: 700, fat: 30 }))
    .toMatchObject({ nameSnapshot: 'Lunch out', nutrientsSnapshot: { kcal: 700, fat: 30 } });
});
test('getDay sorts meals by time, totals live entries, and skips deleted ones', async () => {
  const a = await createMeal('2026-11-16');
  const b = await createMeal('2026-11-16');
  await setMealTime(a.id, '12:30');
  await quickAdd(a.id, 'Lunch out', { kcal: 700 });
  await quickAdd(b.id, undefined, { kcal: 300 });
  const gone = await quickAdd(b.id, undefined, { kcal: 999 });
  await deleteEntry(gone.id);
  const day = await getDay('2026-11-16');
  expect(day.meals.map((x) => x.meal.id)).toEqual([b.id, a.id]);
  expect(day.totals).toEqual({ kcal: 1000 });
  expect(day.complete).toBe(false);
});
test('entries logged in the same instant stay in the order they were logged', async () => {
  const m = await createMeal('2026-11-16');
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const name of names) await quickAdd(m.id, name, { kcal: 1 }); // the test clock does not move
  const day = await getDay('2026-11-16');
  expect(day.meals[0].entries.map((e) => e.nameSnapshot)).toEqual(names);
});
test('deleteMeal removes the meal and its entries from the day', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, undefined, { kcal: 300 });
  await deleteMeal(m.id);
  expect(await getDay('2026-11-16')).toMatchObject({ meals: [], totals: {} });
});
test('setDayComplete persists', async () => {
  await setDayComplete('2026-11-16', true);
  expect((await getDay('2026-11-16')).complete).toBe(true);
});
test('firstEntryAt is the earliest live entry', async () => {
  expect(await firstEntryAt()).toBeUndefined();
  const m = await createMeal('2026-11-16');
  const first = await quickAdd(m.id, undefined, { kcal: 1 });
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  const second = await quickAdd(m.id, undefined, { kcal: 1 });
  expect(await firstEntryAt()).toBe(first.createdAt);
  await deleteEntry(first.id);
  expect(await firstEntryAt()).toBe(second.createdAt);
});
test('pastMealNames suggests names used before, newest first, without "Meal N"', async () => {
  const a = await createMeal('2026-11-15');
  await renameMeal(a.id, 'Lunch');
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  const b = await createMeal('2026-11-16');
  await renameMeal(b.id, 'Pre-workout');
  await createMeal('2026-11-16');
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  const c = await createMeal('2026-11-16');
  await renameMeal(c.id, 'Lunch');
  expect(await pastMealNames()).toEqual(['Lunch', 'Pre-workout']);
});
test('removeEmptyMeals drops meals with nothing in them, only on that day', async () => {
  const empty = await createMeal('2026-11-16');
  const full = await createMeal('2026-11-16');
  await quickAdd(full.id, undefined, { kcal: 100 });
  const emptied = await createMeal('2026-11-16');
  await deleteEntry((await quickAdd(emptied.id, undefined, { kcal: 1 })).id);
  const otherDay = await createMeal('2026-11-15');
  await removeEmptyMeals('2026-11-16');
  expect((await getDay('2026-11-16')).meals.map((m) => m.meal.id)).toEqual([full.id]);
  expect((await getDay('2026-11-15')).meals.map((m) => m.meal.id)).toEqual([otherDay.id]);
  expect((await db.meals.get(empty.id))?.deletedAt).toEqual(expect.any(String));
});
