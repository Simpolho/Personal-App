import Dexie from 'dexie';
import { afterEach, expect, test } from 'vitest';
import { db, resetDb } from './db';

afterEach(() => resetDb());

const T = '2026-11-20T10:00:00.000Z';
const base = (id: string) => ({ id, createdAt: T, updatedAt: T });
const item = (exerciseId: string, startWeight: number) => ({ exerciseId, sets: 3, repsMin: 10, repsMax: 15, rpeTarget: '', startWeight });

test('opening a version 3 database cleans up plates and bodyweight once', async () => {
  db.close();
  await Dexie.delete('fitness-app');
  // The database as version 3 of the app left it.
  const old = new Dexie('fitness-app');
  old.version(1).stores({
    tableFoods: 'id',
    foods: 'id, barcode',
    foodUsage: 'id, lastUsedAt',
    recipes: 'id',
    meals: 'id, date',
    mealTemplates: 'id',
    days: 'id',
    logEntries: 'id, mealId',
    targets: 'id, effectiveFrom',
    settings: 'id',
    meta: 'key',
  });
  old.version(2).stores({ weights: 'id, date', water: 'id, date' });
  old.version(3).stores({ exercises: 'id, name', routines: 'id', workouts: 'id, date, startedAt, *exerciseIds' });
  await old.open();
  const legExt = { ...base('legext'), name: 'Leg extension', muscle: 'Quads', unit: 'plates', eachSide: false, note: '' };
  const backExt = { ...base('backext'), name: 'Back extension', muscle: 'Hamstrings', unit: 'bodyweight', eachSide: false, note: '' };
  const bench = { ...base('bench'), name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' };
  const routine = { ...base('lower-a'), name: 'Lower A', weekdays: [1], items: [item('legext', 14), item('backext', 0), item('bench', 60)] };
  const platesEntry = { id: 'e2', exerciseId: 'legext', unit: 'plates', sets: [{ id: 's2', warmup: false, done: true, weight: 14, reps: 12 }] };
  const workout = {
    ...base('w1'),
    date: '2026-11-16',
    name: 'Lower A',
    startedAt: '2026-11-16T10:00:00.000Z',
    finishedAt: '2026-11-16T11:00:00.000Z',
    exerciseIds: ['backext', 'legext'],
    entries: [{ id: 'e1', exerciseId: 'backext', unit: 'bodyweight', sets: [{ id: 's1', warmup: false, done: true, reps: 12 }] }, platesEntry],
  };
  const weight = { ...base('2026-11-16'), date: '2026-11-16', kg: 78 };
  await old.table('exercises').bulkAdd([legExt, backExt, bench]);
  await old.table('routines').add(routine);
  await old.table('workouts').add(workout);
  await old.table('weights').add(weight);
  old.close();

  await db.open();
  expect(db.verno).toBe(4);
  for (const id of ['legext', 'backext']) {
    const e = (await db.exercises.get(id))!;
    expect(e.unit).toBe('kg');
    expect(e.updatedAt > T).toBe(true);
  }
  expect(await db.exercises.get('bench')).toEqual(bench);
  const r = (await db.routines.get('lower-a'))!;
  expect(r.items.map((i) => i.startWeight)).toEqual([undefined, 0, 60]);
  expect(r.updatedAt > T).toBe(true);
  const w = (await db.workouts.get('w1'))!;
  expect(w.entries[0]).toMatchObject({ unit: 'kg', sets: [{ weight: 0, reps: 12 }] });
  expect(w.entries[1]).toEqual(platesEntry);
  expect(w.updatedAt > T).toBe(true);
  expect(await db.weights.get('2026-11-16')).toEqual(weight);
});
