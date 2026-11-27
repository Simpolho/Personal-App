import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from './db';
import type { Workout } from './types';
import {
  deleteExercise,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getExerciseHistory,
  lastSetsFor,
  listExercises,
  newEntry,
  previousRoutineWorkout,
  saveExercise,
  saveRoutine,
  saveWorkout,
  setExerciseNote,
  setExerciseUnit,
  startWorkout,
} from './workouts';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
});

async function setup() {
  const bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  const raise = await saveExercise({ name: 'Raise', muscle: 'Shoulders', unit: 'kg', eachSide: false, note: '' });
  const upperA = await saveRoutine({
    name: 'Upper A',
    weekdays: [1],
    items: [
      { exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 },
      { exerciseId: raise.id, sets: 2, repsMin: 12, repsMax: 15, rpeTarget: '8–9', startWeight: 4 },
    ],
  });
  const upperB = await saveRoutine({
    name: 'Upper B',
    weekdays: [4],
    items: [{ exerciseId: raise.id, sets: 2, repsMin: 12, repsMax: 15, rpeTarget: '8–9', startWeight: 4 }],
  });
  return { bench, raise, upperA, upperB };
}

/** Ticks the given sets of an entry with weight × reps, like tapping ✓ after typing. */
async function tick(w: Workout, entryIndex: number, values: [number, number][]): Promise<Workout> {
  const entries = w.entries.map((e, i) =>
    i !== entryIndex ? e : { ...e, sets: e.sets.map((s, j) => (values[j] ? { ...s, weight: values[j][0], reps: values[j][1], done: true } : s)) },
  );
  return saveWorkout({ ...w, entries });
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

test('starting a routine pre-fills from the starting weight, then from last time', async () => {
  const { bench, upperA } = await setup();
  const first = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect(first.name).toBe('Upper A');
  expect(first.entries[0]?.target).toEqual({ sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8' });
  expect(first.entries[0]?.sets.map((s) => [s.weight, s.reps])).toEqual([
    [22.5, undefined],
    [22.5, undefined],
    [22.5, undefined],
  ]);
  await tick(first, 0, [
    [25, 8],
    [25, 7],
  ]);
  at('2026-11-23T11:00:00Z');
  const finished = await finishWorkout(first.id);
  expect(finished.finishedAt).toBeDefined();
  expect(finished.entries.map((e) => [e.exerciseId, e.sets.map((s) => [s.weight, s.reps])])).toEqual([
    [
      bench.id,
      [
        [25, 8],
        [25, 7],
      ],
    ],
  ]);
  expect(await getActiveWorkout()).toBeUndefined();

  at('2026-11-26T10:00:00Z');
  const next = await startWorkout({ routineId: upperA.id, date: '2026-11-26' });
  expect(next.entries[0]?.sets.map((s) => [s.weight, s.reps, s.done])).toEqual([
    [25, 8, false],
    [25, 7, false],
    [25, 7, false],
  ]);
});

test('one workout at a time, and Finish needs at least one ticked set', async () => {
  const { upperA } = await setup();
  const w = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect((await getActiveWorkout())?.id).toBe(w.id);
  await expect(startWorkout({ date: '2026-11-23' })).rejects.toThrow('A workout is already in progress');
  await expect(finishWorkout(w.id)).rejects.toThrow();
  expect((await getActiveWorkout())?.id).toBe(w.id);
});

test('last time carries across routines', async () => {
  const { raise, upperA, upperB } = await setup();
  at('2026-11-20T10:00:00Z');
  const b = await startWorkout({ routineId: upperB.id, date: '2026-11-20' });
  await tick(b, 0, [
    [5, 15],
    [5, 14],
  ]);
  await finishWorkout(b.id);
  at('2026-11-23T10:00:00Z');
  const a = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect(a.entries.find((e) => e.exerciseId === raise.id)?.sets.map((s) => [s.weight, s.reps])).toEqual([
    [5, 15],
    [5, 14],
  ]);
});

test('deleting the only workout that had an exercise falls back to the starting weight', async () => {
  const { upperA } = await setup();
  at('2026-11-20T10:00:00Z');
  const w = await startWorkout({ routineId: upperA.id, date: '2026-11-20' });
  await tick(w, 0, [[30, 5]]);
  await finishWorkout(w.id);
  await deleteWorkout(w.id);
  at('2026-11-23T10:00:00Z');
  const next = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect(next.entries[0]?.sets[0]?.weight).toBe(22.5);
});

test('an exercise used by a routine is not deleted', async () => {
  const { bench, raise, upperA } = await setup();
  expect(await deleteExercise(bench.id)).toEqual({ usedIn: ['Upper A'] });
  expect((await listExercises()).map((e) => e.name)).toEqual(['Bench', 'Raise']);
  await saveRoutine({ ...upperA, items: upperA.items.filter((i) => i.exerciseId !== bench.id) }, upperA.id);
  expect(await deleteExercise(bench.id)).toEqual({ usedIn: [] });
  expect((await listExercises()).map((e) => e.name)).toEqual(['Raise']);
  expect(raise.id).toBeTruthy();
});

test('the previous workout of the same routine skips other routines in between', async () => {
  const { upperA, upperB } = await setup();
  at('2026-11-16T10:00:00Z');
  const a1 = await startWorkout({ routineId: upperA.id, date: '2026-11-16' });
  await tick(a1, 0, [[25, 8]]);
  await finishWorkout(a1.id);
  at('2026-11-20T10:00:00Z');
  const b = await startWorkout({ routineId: upperB.id, date: '2026-11-20' });
  await tick(b, 0, [[5, 15]]);
  await finishWorkout(b.id);
  at('2026-11-23T10:00:00Z');
  const a2 = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect((await previousRoutineWorkout(upperA.id, a2.startedAt))?.id).toBe(a1.id);
});

test('exerciseIds follow the entries; an added entry is pre-filled with one set', async () => {
  const { bench, raise, upperA } = await setup();
  at('2026-11-16T10:00:00Z');
  const old = await startWorkout({ routineId: upperA.id, date: '2026-11-16' });
  await tick(old, 1, [[6, 12]]);
  await finishWorkout(old.id);
  at('2026-11-23T10:00:00Z');
  const w = await startWorkout({ date: '2026-11-23' });
  expect(w.name).toBe('Workout');
  expect(w.entries).toEqual([]);
  const added = await newEntry(raise.id, w.startedAt);
  expect(added.sets.map((s) => [s.weight, s.reps])).toEqual([[6, 12]]);
  expect(added.unit).toBe('kg');
  expect(added.target).toBeUndefined();
  let saved = await saveWorkout({ ...w, entries: [added, await newEntry(bench.id, w.startedAt)] });
  expect(saved.exerciseIds).toEqual([raise.id, bench.id]);
  saved = await saveWorkout({ ...saved, entries: saved.entries.slice(1) });
  expect(saved.exerciseIds).toEqual([bench.id]);
  expect(await lastSetsFor(raise.id, w.startedAt)).toHaveLength(1);
});

test('after an exercise changes unit, last time in the old unit is not used to pre-fill', async () => {
  const { bench, upperA } = await setup();
  await saveExercise({ ...bench, unit: 'lb' }, bench.id);
  at('2026-11-16T10:00:00Z');
  const old = await startWorkout({ routineId: upperA.id, date: '2026-11-16' });
  expect(old.entries[0]?.unit).toBe('lb');
  await tick(old, 0, [[14, 12]]);
  await finishWorkout(old.id);
  await saveExercise({ ...bench, unit: 'kg' }, bench.id);
  at('2026-11-23T10:00:00Z');
  const next = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
  expect(next.entries[0]?.sets.map((s) => [s.weight, s.reps])).toEqual([
    [22.5, undefined],
    [22.5, undefined],
    [22.5, undefined],
  ]);
});

test('setExerciseUnit changes the unit and nothing else', async () => {
  const { bench } = await setup();
  await setExerciseNote(bench.id, 'elbows in');
  await setExerciseUnit(bench.id, 'lb');
  const after = (await db.exercises.get(bench.id))!;
  expect(after).toMatchObject({ unit: 'lb', note: 'elbows in', name: bench.name });
  await setExerciseUnit(bench.id, 'lb');
  expect((await db.exercises.get(bench.id))!.updatedAt).toBe(after.updatedAt);
});

test('getExerciseHistory lists finished workouts with that exercise', async () => {
  const { bench, upperA } = await setup();
  at('2026-11-16T10:00:00Z');
  const done = await startWorkout({ routineId: upperA.id, date: '2026-11-16' });
  await tick(done, 0, [[60, 8]]);
  await finishWorkout(done.id);
  at('2026-11-23T10:00:00Z');
  await startWorkout({ routineId: upperA.id, date: '2026-11-23' }); // still in progress
  const history = await getExerciseHistory(bench.id);
  expect(history.map((h) => [h.workoutId, h.date])).toEqual([[done.id, '2026-11-16']]);
  expect(history[0]!.sets.map((s) => [s.weight, s.reps])).toEqual([[60, 8]]);
});
