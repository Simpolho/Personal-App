import type { Exercise, MuscleGroup, Routine, WeightUnit, Workout, WorkoutSet } from '../db/types';
import { parseAmount } from './nutrients';

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Abs',
];
export const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lb', 'plates', 'bodyweight'];
export const RPE_VALUES = [6, 7, 8, 9, 10] as const;

const KG_PER_LB = 0.45359237;

/** A typed weight: 0 or more, at most 2 decimals, decimal comma accepted. Checked on the text, not the float. */
export function parseLift(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^(\d+(\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  return Number(text);
}

/** Typed reps: a whole number from 1 to 100. */
export function parseReps(input: string): number | null {
  const value = parseAmount(input);
  if (value === null || !Number.isInteger(value) || value < 1 || value > 100) return null;
  return value;
}

/**
 * A set's weight in kg, or null when it can't be known: plates on a machine whose plate weight
 * isn't set, or bodyweight before any weight has been logged. `unit` is the unit the set was
 * logged in; the plate weight comes from the exercise as it is now.
 */
export function setKg(
  weight: number | undefined,
  unit: WeightUnit,
  exercise: Pick<Exercise, 'plateWeight'>,
  bodyKg: number | null,
): number | null {
  const w = weight ?? 0;
  switch (unit) {
    case 'kg':
      return w;
    case 'lb':
      return w * KG_PER_LB;
    case 'plates': {
      const plate = exercise.plateWeight;
      if (!plate) return null;
      return w * (plate.unit === 'lb' ? plate.value * KG_PER_LB : plate.value);
    }
    case 'bodyweight':
      return bodyKg === null ? null : bodyKg + w;
  }
}

/**
 * The Finish rule: only ticked sets are kept, entries left with none are dropped, and the workout
 * gets its finish time. Null when nothing is ticked.
 */
export function finishedVersion(w: Workout, finishedAt: string): Workout | null {
  const entries = w.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length > 0);
  return entries.length === 0 ? null : { ...w, entries, finishedAt };
}

/** Done, not a warm-up, and with reps: the sets that count. */
export const isWorkingSet = (s: WorkoutSet): boolean => s.done && !s.warmup && s.reps !== undefined;

export type RecapRow = { muscle: MuscleGroup; sets: number; volume: number; change?: number };
export type Recap = { rows: RecapRow[]; leftOut: { name: string; reason: 'plates' | 'bodyweight' }[] };

/**
 * Working sets and volume (kg × reps, × 2 for each side) per muscle group. Muscle group, each side
 * and plate weight are read from the exercises as they are now; the unit from the entry.
 */
export function recapOf(workout: Workout, exercises: Map<string, Exercise>, bodyKg: number | null): Recap {
  const totals = new Map<MuscleGroup, { sets: number; volume: number }>();
  const leftOut: Recap['leftOut'] = [];
  for (const entry of workout.entries) {
    const exercise = exercises.get(entry.exerciseId);
    if (!exercise) continue;
    const working = entry.sets.filter(isWorkingSet);
    if (working.length === 0) continue;
    const total = totals.get(exercise.muscle) ?? { sets: 0, volume: 0 };
    let unknown = false;
    for (const s of working) {
      total.sets += 1;
      const kg = setKg(s.weight, entry.unit, exercise, bodyKg);
      if (kg === null) unknown = true;
      else total.volume += kg * (s.reps ?? 0) * (exercise.eachSide ? 2 : 1);
    }
    totals.set(exercise.muscle, total);
    if (unknown && !leftOut.some((l) => l.name === exercise.name)) {
      leftOut.push({ name: exercise.name, reason: entry.unit === 'bodyweight' ? 'bodyweight' : 'plates' });
    }
  }
  const rows = MUSCLE_GROUPS.flatMap((muscle) => {
    const t = totals.get(muscle);
    return t ? [{ muscle, ...t }] : [];
  });
  return { rows, leftOut };
}

/** Adds each muscle group's change in volume against the previous recap, where it had that group. */
export function withChanges(now: Recap, previous: Recap | null): Recap {
  if (!previous) return now;
  return {
    ...now,
    rows: now.rows.map((row) => {
      const before = previous.rows.find((r) => r.muscle === row.muscle);
      return before ? { ...row, change: row.volume - before.volume } : row;
    }),
  };
}

/**
 * Sets for a new workout: last time's working sets in order (the last one repeated if there were
 * fewer), else the starting weight with reps empty, else empty. Warm-ups are never copied.
 */
export function prefillSets(count: number, last: WorkoutSet[] | null, startWeight?: number): WorkoutSet[] {
  const source = (last ?? []).filter((s) => !s.warmup);
  return Array.from({ length: count }, (_, i) => {
    const from = source.length > 0 ? source[Math.min(i, source.length - 1)] : undefined;
    return {
      id: crypto.randomUUID(),
      warmup: false,
      done: false,
      weight: from ? from.weight : startWeight,
      reps: from ? from.reps : undefined,
    };
  });
}

const num = (v: number | undefined) => (v === undefined ? '–' : String(v));

/** "22.5×9, 22.5×8" */
export function formatLast(sets: WorkoutSet[]): string {
  return sets.map((s) => `${num(s.weight)}×${num(s.reps)}`).join(', ');
}

/** "3 × 8–12 · RPE 7–8" */
export function formatTarget(t: { sets: number; repsMin: number; repsMax: number; rpeTarget: string }): string {
  const reps = t.repsMin === t.repsMax ? `${t.repsMin}` : `${t.repsMin}–${t.repsMax}`;
  const rpe = t.rpeTarget.trim() ? ` · RPE ${t.rpeTarget.trim()}` : '';
  return `${t.sets} × ${reps}${rpe}`;
}

/** "32:10", or "1:05:10" past an hour. */
export function formatElapsed(fromIso: string, now: Date): string {
  const total = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The routines planned for a local date's weekday. */
export function routinesForDate(routines: Routine[], date: string): Routine[] {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(y!, m! - 1, d!).getDay();
  return routines.filter((r) => r.weekdays.includes(weekday));
}

/** Minutes between start and finish; null for one in progress or logged afterwards (start = finish). */
export function workoutMinutes(w: Pick<Workout, 'startedAt' | 'finishedAt'>): number | null {
  if (!w.finishedAt) return null;
  const minutes = Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}
