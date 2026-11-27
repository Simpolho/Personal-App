import { expect, test } from 'vitest';
import type { EntryUnit, Workout, WorkoutEntry, WorkoutSet } from '../db/types';
import { bestEver, bestSet, estimatedMax, exerciseHistory, formatHistorySet, type HistorySession } from './history';

let n = 0;
const set = (weight: number | undefined, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++n}`,
  warmup: false,
  done: true,
  weight,
  reps,
  ...extra,
});
const entry = (exerciseId: string, unit: EntryUnit, sets: WorkoutSet[]): WorkoutEntry => ({ id: `e${++n}`, exerciseId, unit, sets });
const workout = (id: string, date: string, entries: WorkoutEntry[], extra: Partial<Workout> = {}): Workout => ({
  id,
  date,
  name: 'Upper A',
  startedAt: `${date}T10:00:00.000Z`,
  finishedAt: `${date}T11:00:00.000Z`,
  entries,
  exerciseIds: entries.map((e) => e.exerciseId),
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const session = (unit: EntryUnit, weight: number, reps: number): HistorySession => {
  const s = set(weight, reps);
  return { workoutId: `w${++n}`, date: '2026-11-17', name: 'Upper A', unit, warmups: [], sets: [s], best: s, bestMax: unit === 'plates' ? null : estimatedMax(weight, reps) };
};

test('estimated max uses the Epley formula, and one rep is the weight itself', () => {
  expect(estimatedMax(80, 6)).toBe(96);
  expect(estimatedMax(100, 1)).toBe(100);
});

test('the best set is the highest estimated max; ties go to more reps, then the earlier set', () => {
  const first = set(80, 6);
  expect(bestSet([first, set(80, 6), set(77.5, 7)])).toBe(first);
  const most = set(0, 15);
  expect(bestSet([set(0, 12), most, set(0, 10)])).toBe(most);
  const plates = set(14, 10);
  expect(bestSet([plates, set(13, 12)])).toBe(plates);
  expect(bestSet([set(100, 5, { warmup: true }), set(90, 5, { done: false }), set(60, 8)])?.weight).toBe(60);
  expect(bestSet([])).toBeNull();
});

test('history lists finished sessions newest first, with warm-ups apart and an estimated max only for kg and lb', () => {
  const workouts = [
    workout('w17', '2026-11-17', [entry('bench', 'kg', [set(40, 10, { warmup: true }), set(80, 6, { rpe: 8 }), set(80, 6), set(77.5, 7)])]),
    workout('w23', '2026-11-23', [entry('bench', 'plates', [set(14, 10), set(13, 10)]), entry('raise', 'lb', [set(10, 12)])]),
    workout('w24', '2026-11-24', [entry('bench', 'kg', [set(0, 12), set(0, 15)])]),
    workout('w26', '2026-11-26', [entry('bench', 'kg', [set(85, 5)])], { finishedAt: undefined }),
    workout('w25', '2026-11-25', [entry('bench', 'kg', [set(90, 5)])], { deletedAt: '2026-11-25T12:00:00.000Z' }),
  ];
  const history = exerciseHistory('bench', workouts);
  expect(history.map((h) => h.workoutId)).toEqual(['w24', 'w23', 'w17']);
  const [zero, plates, kg] = history;
  expect(kg).toMatchObject({ date: '2026-11-17', name: 'Upper A', unit: 'kg', bestMax: 96 });
  expect(kg!.warmups.map((s) => s.weight)).toEqual([40]);
  expect(kg!.sets.map((s) => s.weight)).toEqual([80, 80, 77.5]);
  expect(kg!.best).toBe(kg!.sets[0]);
  expect(plates).toMatchObject({ unit: 'plates', bestMax: null });
  expect(plates!.best?.weight).toBe(14);
  expect(zero).toMatchObject({ bestMax: null });
  expect(zero!.best?.reps).toBe(15);
});

test('the best ever compares across kg and lb and is given in the current unit', () => {
  const kg = session('kg', 80, 6); // 96 kg
  const lb = session('lb', 176, 6); // 211.2 lb ≈ 95.8 kg
  expect(bestEver([kg, lb], 'kg')).toEqual({ session: kg, max: 96 });
  const heavy = session('lb', 200, 6); // 240 lb ≈ 108.86 kg
  const best = bestEver([kg, lb, heavy], 'kg')!;
  expect(best.session).toBe(heavy);
  expect(best.max).toBeCloseTo(108.86, 2);
  expect(bestEver([kg], 'lb')!.max).toBeCloseTo(211.64, 2);
  expect(bestEver([session('plates', 14, 10)], 'kg')).toBeNull();
});

test('a history set reads like the workout screen, with the RPE after it', () => {
  expect(formatHistorySet(set(80, 6, { rpe: 8 }))).toBe('80×6 @8');
  expect(formatHistorySet(set(77.5, 7))).toBe('77.5×7');
  expect(formatHistorySet(set(undefined, 12))).toBe('–×12');
});
