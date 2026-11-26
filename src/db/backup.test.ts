import { beforeEach, expect, test, vi } from 'vitest';
import { exportAll, importAll, ImportError, RECORD_TABLES, setLastExportAt } from './backup';
import { db, resetDb } from './db';
import { listFoods, saveFood } from './foods';
import { createMeal, deleteEntry, getDay, logFood, quickAdd, setDayComplete, setDayKind } from './log';
import { getTargetSetsFor, setTargets } from './targets';
import { addWater, getWaterSettings, setWaterSettings, waterTotal } from './water';
import { listWeights, logWeight } from './weight';
import { finishWorkout, saveExercise, saveRoutine, saveWorkout, startWorkout } from './workouts';

beforeEach(() => resetDb());

async function seed() {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  await logFood(m.id, f.id, 50, 'g');
  await setTargets('2026-11-16', { kcal: 2200 });
  await setDayComplete('2026-11-16', true);
  const gone = await quickAdd(m.id, undefined, { kcal: 1 });
  await deleteEntry(gone.id);
}

test('export then import into an empty app gives back the same records', async () => {
  await seed();
  const file = await exportAll();
  expect(file).toMatchObject({ format: 'fitness-app-export', version: 1 });
  expect(file.records.logEntries).toHaveLength(2); // includes the deleted one
  await resetDb();
  expect(await importAll(JSON.parse(JSON.stringify(file)))).toMatchObject({ updated: 0, skipped: 0 });
  const again = await exportAll();
  for (const t of RECORD_TABLES.filter((t) => t !== 'settings')) expect(again.records[t]).toEqual(file.records[t]);
  expect((await getDay('2026-11-16')).totals).toEqual({ kcal: 125 });
});
test('importing the same file twice changes nothing', async () => {
  await seed();
  const file = await exportAll();
  expect(await importAll(file)).toMatchObject({ added: 0, updated: 0 });
});
test('newer records win', async () => {
  await seed();
  const file = await exportAll();
  const f = (await listFoods())[0];
  vi.setSystemTime(new Date(Date.now() + 60_000));
  await saveFood({ ...f, name: 'Pão de forma' });
  await importAll(file);
  expect((await listFoods())[0].name).toBe('Pão de forma');
});
test('rejects other files and newer versions', async () => {
  await expect(importAll({ hello: 1 })).rejects.toThrow('Not a backup file from this app');
  await expect(importAll({ format: 'fitness-app-export', version: 2, exportedAt: '', records: {} }))
    .rejects.toThrow('This backup was made by a newer version of the app');
  await expect(importAll(null)).rejects.toBeInstanceOf(ImportError);
});
test('a damaged file is rejected whole, before anything is written', async () => {
  const bad = {
    format: 'fitness-app-export',
    version: 1,
    exportedAt: '',
    records: { foods: [{ id: 'a', createdAt: 'x', updatedAt: 'x', name: 'ok' }], meals: [{ name: 'no id' }] },
  };
  await expect(importAll(bad)).rejects.toBeInstanceOf(ImportError);
  expect(await db.foods.count()).toBe(0);
});
test('the export never contains the bundled tables', async () => {
  await db.tableFoods.put({ id: 'usda:1', name: 'X', source: 'usda', basis: '100g', nutrients: {}, servings: [], searchKey: 'x' });
  const file = await exportAll();
  expect(Object.keys(file.records).sort()).toEqual([...RECORD_TABLES].sort());
});
test('exportAll stamps the last export; a cancelled export can put the old stamp back', async () => {
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  const file = await exportAll();
  expect((await db.settings.get('settings'))?.lastExportAt).toBe(file.exportedAt);
  await setLastExportAt(undefined);
  expect((await db.settings.get('settings'))?.lastExportAt).toBeUndefined();
});
test('records with missing or wrong fields are refused, so a bad file cannot break the app', async () => {
  const base = { id: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const file = (records: object) => ({ format: 'fitness-app-export', version: 1, exportedAt: '', records });
  const bad = [
    { logEntries: [{ ...base, mealId: 'm', nameSnapshot: 'A', amount: 1, unit: 'g' }] }, // no nutrientsSnapshot
    { logEntries: [{ ...base, mealId: 'm', nameSnapshot: 'A', amount: 1, unit: 'g', nutrientsSnapshot: { kcal: 'lots' } }] },
    { foods: [{ ...base, basis: '100g', nutrients: {}, servings: [] }] }, // no name
    { foods: [{ ...base, name: 'A', basis: 'cup', nutrients: {}, servings: [] }] },
    { meals: [{ ...base, name: 'Lunch', time: '12:00' }] }, // no date
    { recipes: [{ ...base, name: 'R', items: 'none', servings: 2 }] },
    { days: [{ ...base, date: '2026-01-01', complete: 'yes' }] },
  ];
  for (const records of bad) await expect(importAll(file(records))).rejects.toBeInstanceOf(ImportError);
  expect(await db.logEntries.count() + await db.foods.count() + await db.meals.count()).toBe(0);
});
test('exporting a backup keeps the water settings', async () => {
  await setWaterSettings({ targetMl: 2500, smallMl: 330, largeMl: 750 });
  await exportAll();
  expect(await getWaterSettings()).toEqual({ targetMl: 2500, smallMl: 330, largeMl: 750 });
});
test('weights and water go through a backup and back', async () => {
  await logWeight('2026-11-23', 78.45);
  await addWater('2026-11-23', 500);
  const file = await exportAll();
  expect(file.records.weights).toHaveLength(1);
  expect(file.records.water).toHaveLength(1);
  await resetDb();
  await importAll(JSON.parse(JSON.stringify(file)));
  expect((await listWeights()).map((w) => w.kg)).toEqual([78.45]);
  expect(await waterTotal('2026-11-23')).toBe(500);
});
test('a backup from before weights and water still imports', async () => {
  const old = { format: 'fitness-app-export', version: 1, exportedAt: '', records: { foods: [], meals: [] } };
  expect(await importAll(old)).toMatchObject({ added: 0 });
});
test('a water record with a non-number amount is refused', async () => {
  const bad = { format: 'fitness-app-export', version: 1, exportedAt: '', records: { water: [{ id: 'w', createdAt: 'x', updatedAt: 'x', date: '2026-11-23', ml: 'lots' }] } };
  await expect(importAll(bad)).rejects.toBeInstanceOf(ImportError);
});
test('exercises, routines and workouts go through a backup and back exactly', async () => {
  const ex = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'plates', plateWeight: { value: 5, unit: 'kg' }, eachSide: false, note: 'seat 4' });
  const routine = await saveRoutine({ name: 'Upper A', weekdays: [1], items: [{ exerciseId: ex.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 }] });
  const started = await startWorkout({ routineId: routine.id, date: '2026-11-23' });
  await saveWorkout({ ...started, entries: started.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, reps: 8, rpe: 8, done: true })) })) });
  await finishWorkout(started.id);
  const before = { exercises: await db.exercises.toArray(), routines: await db.routines.toArray(), workouts: await db.workouts.toArray() };
  const file = await exportAll();
  expect(file.records.workouts).toHaveLength(1);
  await resetDb();
  await importAll(JSON.parse(JSON.stringify(file)));
  expect({ exercises: await db.exercises.toArray(), routines: await db.routines.toArray(), workouts: await db.workouts.toArray() }).toEqual(before);
});
test('a backup from before workouts still imports, and a damaged workout is refused', async () => {
  const old = { format: 'fitness-app-export', version: 1, exportedAt: '', records: { weights: [], water: [] } };
  expect(await importAll(old)).toMatchObject({ added: 0 });
  const bad = {
    format: 'fitness-app-export',
    version: 1,
    exportedAt: '',
    records: { workouts: [{ id: 'w', createdAt: 'x', updatedAt: 'x', date: '2026-11-23', name: 'Upper A', startedAt: 'x', entries: 'none', exerciseIds: [] }] },
  };
  await expect(importAll(bad)).rejects.toBeInstanceOf(ImportError);
});
test('a rest-day set and day choices go through a backup and back', async () => {
  await setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 });
  await setDayKind('2026-11-16', 'rest');
  const file = await exportAll();
  await resetDb();
  await importAll(JSON.parse(JSON.stringify(file)));
  expect(await getTargetSetsFor('2026-11-16')).toEqual({ main: { kcal: 2400 }, rest: { kcal: 2000 } });
  expect(await db.days.get('2026-11-16')).toMatchObject({ kind: 'rest', complete: false });
});
test('a damaged day choice or rest set is refused', async () => {
  const base = { id: 'x', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const file = (records: object) => ({ format: 'fitness-app-export', version: 1, exportedAt: '', records });
  const bad = [
    { days: [{ ...base, date: '2026-01-01', complete: false, kind: 'gym' }] },
    { targets: [{ ...base, effectiveFrom: '2026-01-01', kcal: 2000, rest: { kcal: 'x' } }] },
    { targets: [{ ...base, effectiveFrom: '2026-01-01', rest: 'none' }] },
  ];
  for (const records of bad) await expect(importAll(file(records))).rejects.toBeInstanceOf(ImportError);
  expect((await db.days.count()) + (await db.targets.count())).toBe(0);
});
