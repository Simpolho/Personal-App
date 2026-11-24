import { expect, test } from 'vitest';
import type { Exercise, MuscleGroup, WeightUnit, Workout, WorkoutEntry, WorkoutSet } from '../db/types';
import {
  formatElapsed,
  formatLast,
  formatTarget,
  MUSCLE_GROUPS,
  parseLift,
  parseReps,
  prefillSets,
  recapOf,
  routinesForDate,
  setKg,
  withChanges,
  type Recap,
} from './workouts';

let n = 0;
const set = (weight: number | undefined, reps: number | undefined, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++n}`,
  warmup: false,
  done: true,
  weight,
  reps,
  ...extra,
});
const exercise = (id: string, muscle: MuscleGroup, unit: WeightUnit, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  muscle,
  unit,
  eachSide: false,
  note: '',
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const entry = (exerciseId: string, unit: WeightUnit, sets: WorkoutSet[]): WorkoutEntry => ({ id: `e-${exerciseId}`, exerciseId, unit, sets });
const workout = (entries: WorkoutEntry[]): Workout => ({
  id: 'w1',
  date: '2026-11-23',
  name: 'Upper A',
  startedAt: '2026-11-23T10:00:00.000Z',
  entries,
  exerciseIds: entries.map((e) => e.exerciseId),
  createdAt: '',
  updatedAt: '',
});

test('weights and reps are parsed from what is typed', () => {
  expect(parseLift('22,5')).toBe(22.5);
  expect(parseLift('0')).toBe(0);
  expect(parseLift('1.234')).toBeNull();
  expect(parseLift('-1')).toBeNull();
  expect(parseLift('')).toBeNull();
  expect(parseReps('8')).toBe(8);
  expect(parseReps('0')).toBeNull();
  expect(parseReps('8.5')).toBeNull();
  expect(parseReps('101')).toBeNull();
});

test('a set weight in kg, from each unit', () => {
  expect(setKg(60, 'kg', {}, null)).toBe(60);
  expect(setKg(10, 'lb', {}, null)).toBeCloseTo(4.5359237, 7);
  expect(setKg(14, 'plates', {}, null)).toBeNull();
  expect(setKg(14, 'plates', { plateWeight: { value: 5, unit: 'kg' } }, null)).toBe(70);
  expect(setKg(14, 'plates', { plateWeight: { value: 10, unit: 'lb' } }, null)).toBeCloseTo(63.5029318, 6);
  expect(setKg(0, 'bodyweight', {}, 78)).toBe(78);
  expect(setKg(10, 'bodyweight', {}, 78)).toBe(88);
  expect(setKg(0, 'bodyweight', {}, null)).toBeNull();
});

const exercises = new Map(
  [
    exercise('Bench', 'Chest', 'kg'),
    exercise('Raise', 'Shoulders', 'lb'),
    exercise('LegExt', 'Quads', 'plates'),
    exercise('SLPress', 'Quads', 'kg', { eachSide: true }),
    exercise('BackExt', 'Hamstrings', 'bodyweight'),
  ].map((e) => [e.id, e]),
);
const fullWorkout = () =>
  workout([
    entry('Bench', 'kg', [
      set(40, 10, { warmup: true }),
      set(60, 8),
      set(60, 8),
      set(57.5, 7, { done: false }),
      set(60, undefined),
    ]),
    entry('Raise', 'lb', [set(10, 12)]),
    entry('LegExt', 'plates', [set(14, 12)]),
    entry('SLPress', 'kg', [set(25, 10)]),
    entry('BackExt', 'bodyweight', [set(0, 12)]),
  ]);

test('the recap adds up working sets and volume per muscle group, in the fixed order', () => {
  const recap = recapOf(fullWorkout(), exercises, 78);
  expect(recap.rows.map((r) => r.muscle)).toEqual(['Chest', 'Shoulders', 'Quads', 'Hamstrings']);
  const row = (m: MuscleGroup) => recap.rows.find((r) => r.muscle === m)!;
  expect(row('Chest')).toMatchObject({ sets: 2, volume: 960 });
  expect(row('Shoulders').volume).toBeCloseTo(54.43, 2);
  expect(row('Quads')).toMatchObject({ sets: 2, volume: 500 }); // leg extension counts as a set, not volume
  expect(row('Hamstrings')).toMatchObject({ sets: 1, volume: 936 });
  expect(recap.leftOut).toEqual([{ name: 'LegExt', reason: 'plates' }]);
});

test('bodyweight with no weight ever logged is left out of the volume, and named', () => {
  const recap = recapOf(fullWorkout(), exercises, null);
  expect(recap.rows.find((r) => r.muscle === 'Hamstrings')).toMatchObject({ sets: 1, volume: 0 });
  expect(recap.leftOut).toContainEqual({ name: 'BackExt', reason: 'bodyweight' });
});

test('settings changed later: a plate weight counts past sets; the unit a set was logged in wins', () => {
  const later = new Map(exercises);
  later.set('LegExt', exercise('LegExt', 'Quads', 'plates', { plateWeight: { value: 5, unit: 'kg' } }));
  const recap = recapOf(fullWorkout(), later, 78);
  expect(recap.rows.find((r) => r.muscle === 'Quads')?.volume).toBe(500 + 840);
  expect(recap.leftOut).toEqual([]);

  const nowKg = new Map(later);
  nowKg.set('LegExt', exercise('LegExt', 'Quads', 'kg', { plateWeight: { value: 5, unit: 'kg' } }));
  expect(recapOf(fullWorkout(), nowKg, 78).rows.find((r) => r.muscle === 'Quads')?.volume).toBe(500 + 840);
});

test('changes against the previous recap', () => {
  const now: Recap = { rows: [{ muscle: 'Chest', sets: 2, volume: 960 }, { muscle: 'Back', sets: 3, volume: 1000 }], leftOut: [] };
  const previous: Recap = { rows: [{ muscle: 'Chest', sets: 2, volume: 900 }], leftOut: [] };
  const compared = withChanges(now, previous);
  expect(compared.rows[0]?.change).toBe(60);
  expect(compared.rows[1]?.change).toBeUndefined();
  expect(withChanges(now, null).rows.every((r) => r.change === undefined)).toBe(true);
});

test('pre-filling copies last time, repeats its last set, skips warm-ups, else uses the starting weight', () => {
  const last = [set(40, 10, { warmup: true }), set(60, 8), set(60, 8)];
  const filled = prefillSets(3, last, 22.5);
  expect(filled.map((s) => [s.weight, s.reps, s.done, s.warmup])).toEqual([
    [60, 8, false, false],
    [60, 8, false, false],
    [60, 8, false, false],
  ]);
  expect(new Set(filled.map((s) => s.id)).size).toBe(3);
  expect(filled.every((s) => !last.some((l) => l.id === s.id))).toBe(true);
  expect(prefillSets(3, null, 22.5).map((s) => [s.weight, s.reps])).toEqual([
    [22.5, undefined],
    [22.5, undefined],
    [22.5, undefined],
  ]);
  expect(prefillSets(2, null).map((s) => [s.weight, s.reps])).toEqual([
    [undefined, undefined],
    [undefined, undefined],
  ]);
});

test('formatting the target, last time and the elapsed time', () => {
  expect(formatTarget({ sets: 3, repsMin: 8, repsMax: 12, rpeTarget: '7–8' })).toBe('3 × 8–12 · RPE 7–8');
  expect(formatTarget({ sets: 2, repsMin: 10, repsMax: 10, rpeTarget: '' })).toBe('2 × 10');
  expect(formatLast([set(22.5, 9), set(22.5, 8)])).toBe('22.5×9, 22.5×8');
  const start = '2026-11-23T10:00:00.000Z';
  expect(formatElapsed(start, new Date('2026-11-23T10:32:10.000Z'))).toBe('32:10');
  expect(formatElapsed(start, new Date('2026-11-23T11:05:10.000Z'))).toBe('1:05:10');
});

test("today's routines come from their weekdays", () => {
  const routine = (name: string, weekdays: number[]) => ({ id: name, name, weekdays, items: [], createdAt: '', updatedAt: '' });
  expect(routinesForDate([routine('Upper A', [1]), routine('Upper B', [4])], '2026-11-23').map((r) => r.name)).toEqual(['Upper A']);
  expect(MUSCLE_GROUPS).toEqual(['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs']);
});
