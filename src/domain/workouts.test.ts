import { expect, test } from 'vitest';
import type { EntryUnit, Exercise, ExerciseUnit, MuscleGroup, Routine, Workout, WorkoutEntry, WorkoutSet } from '../db/types';
import {
  cleanUpUnits,
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
const exercise = (id: string, muscle: MuscleGroup, unit: ExerciseUnit, extra: Partial<Exercise> = {}): Exercise => ({
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
const entry = (exerciseId: string, unit: EntryUnit, sets: WorkoutSet[]): WorkoutEntry => ({ id: `e-${exerciseId}`, exerciseId, unit, sets });
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
  for (const [text, value] of [['18,1', 18.1], ['2,3', 2.3], ['72,6', 72.6], ['1,1', 1.1], ['4,55', 4.55], ['36.3', 36.3]] as const) {
    expect(parseLift(text)).toBe(value);
  }
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
  expect(setKg(60, 'kg', {})).toBe(60);
  expect(setKg(10, 'lb', {})).toBeCloseTo(4.5359237, 7);
  expect(setKg(14, 'plates', {})).toBeNull();
  expect(setKg(14, 'plates', { plateWeight: { value: 5, unit: 'kg' } })).toBe(70);
  expect(setKg(14, 'plates', { plateWeight: { value: 10, unit: 'lb' } })).toBeCloseTo(63.5029318, 6);
  expect(setKg(undefined, 'kg', {})).toBe(0);
});

const exercises = new Map(
  [
    exercise('Bench', 'Chest', 'kg'),
    exercise('Raise', 'Shoulders', 'lb'),
    exercise('LegExt', 'Quads', 'kg'), // its old sets were logged in plates
    exercise('SLPress', 'Quads', 'kg', { eachSide: true }),
    exercise('BackExt', 'Hamstrings', 'kg'),
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
    entry('BackExt', 'kg', [set(0, 12)]), // 0 kg held: counts as a set, adds no volume
  ]);

test('the recap adds up working sets and volume per muscle group, in the fixed order', () => {
  const recap = recapOf(fullWorkout(), exercises);
  expect(recap.rows.map((r) => r.muscle)).toEqual(['Chest', 'Shoulders', 'Quads', 'Hamstrings']);
  const row = (m: MuscleGroup) => recap.rows.find((r) => r.muscle === m)!;
  expect(row('Chest')).toMatchObject({ sets: 2, volume: 960 });
  expect(row('Shoulders').volume).toBeCloseTo(54.43, 2);
  expect(row('Quads')).toMatchObject({ sets: 2, volume: 500 }); // leg extension counts as a set, not volume
  expect(row('Hamstrings')).toMatchObject({ sets: 1, volume: 0 });
  expect(recap.leftOut).toEqual([{ name: 'LegExt', reason: 'plates' }]);
});

test('settings changed later: a plate weight counts past sets; the unit a set was logged in wins', () => {
  const later = new Map(exercises);
  later.set('LegExt', exercise('LegExt', 'Quads', 'kg', { plateWeight: { value: 5, unit: 'kg' } }));
  const recap = recapOf(fullWorkout(), later);
  expect(recap.rows.find((r) => r.muscle === 'Quads')?.volume).toBe(500 + 840);
  expect(recap.leftOut).toEqual([]);

  const nowKg = new Map(later);
  nowKg.set('LegExt', exercise('LegExt', 'Quads', 'kg', { plateWeight: { value: 5, unit: 'kg' } }));
  expect(recapOf(fullWorkout(), nowKg).rows.find((r) => r.muscle === 'Quads')?.volume).toBe(500 + 840);
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

const NOW = '2026-11-27T10:00:00.000Z';
/** A record as an older version of the app stored it, with a unit the types no longer allow. */
const legacy = <T>(record: T, fields: Record<string, unknown>) => ({ ...record, ...fields }) as T;
const routine = (items: Routine['items']): Routine => ({ id: 'r1', name: 'Lower A', weekdays: [1], items, createdAt: '', updatedAt: '' });

test('cleanUpUnits switches plates and bodyweight exercises to kg and clears plate start weights', () => {
  const legExt = legacy(exercise('LegExt', 'Quads', 'kg'), { unit: 'plates' });
  const backExt = legacy(exercise('BackExt', 'Hamstrings', 'kg'), { unit: 'bodyweight' });
  const bench = exercise('Bench', 'Chest', 'kg');
  const item = (exerciseId: string, startWeight: number) => ({ exerciseId, sets: 3, repsMin: 8, repsMax: 12, rpeTarget: '', startWeight });
  const result = cleanUpUnits(
    { exercises: [legExt, backExt, bench], routines: [routine([item('LegExt', 14), item('BackExt', 0), item('Bench', 60)])], workouts: [] },
    NOW,
  );
  expect(result.exercises.map((e) => [e.id, e.unit, e.updatedAt])).toEqual([
    ['LegExt', 'kg', NOW],
    ['BackExt', 'kg', NOW],
  ]);
  expect(result.routines).toHaveLength(1);
  expect(result.routines[0]!.updatedAt).toBe(NOW);
  expect(result.routines[0]!.items.map((i) => i.startWeight)).toEqual([undefined, 0, 60]);
  expect('startWeight' in result.routines[0]!.items[0]!).toBe(false);
});

test('cleanUpUnits turns bodyweight entries into kg, empty weight into 0, and leaves plates entries alone', () => {
  const bw = legacy(entry('BackExt', 'kg', [set(undefined, 12), set(10, 10)]), { unit: 'bodyweight' });
  const plates = entry('LegExt', 'plates', [set(14, 12)]);
  const mixed = workout([bw, plates]);
  const kgOnly = { ...workout([entry('Bench', 'kg', [set(60, 8)])]), id: 'w2' };
  const result = cleanUpUnits({ exercises: [], routines: [], workouts: [mixed, kgOnly] }, NOW);
  expect(result.workouts.map((w) => w.id)).toEqual(['w1']);
  const [cleanBw, cleanPlates] = result.workouts[0]!.entries;
  expect(cleanBw!.unit).toBe('kg');
  expect(cleanBw!.sets.map((s) => s.weight)).toEqual([0, 10]);
  expect(cleanPlates).toEqual(plates);
  expect(result.workouts[0]!.updatedAt).toBe(NOW);
});

test('cleanUpUnits on clean data changes nothing', () => {
  const data = {
    exercises: [exercise('Bench', 'Chest', 'kg'), exercise('Raise', 'Shoulders', 'lb')],
    routines: [routine([{ exerciseId: 'Bench', sets: 3, repsMin: 8, repsMax: 12, rpeTarget: '', startWeight: 60 }])],
    workouts: [workout([entry('Bench', 'kg', [set(60, 8)]), entry('LegExt', 'plates', [set(14, 12)])])],
  };
  expect(cleanUpUnits(data, NOW)).toEqual({ exercises: [], routines: [], workouts: [] });
});
