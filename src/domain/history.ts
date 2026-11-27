import type { EntryUnit, ExerciseUnit, Workout, WorkoutSet } from '../db/types';
import { isWorkingSet, KG_PER_LB } from './workouts';

/** Estimated one-rep max (Epley). One rep is the weight itself. */
export function estimatedMax(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

const score = (s: WorkoutSet) => estimatedMax(s.weight ?? 0, s.reps ?? 0);

/**
 * The set with the highest estimated max, on the numbers as logged (an empty weight counts as 0).
 * A tie goes to more reps, then the earlier set. Null when there are no working sets.
 */
export function bestSet(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  for (const s of sets.filter(isWorkingSet)) {
    if (!best || score(s) > score(best) || (score(s) === score(best) && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  return best;
}

export interface HistorySession {
  workoutId: string;
  date: string;
  name: string;
  /** The unit these sets were logged in. */
  unit: EntryUnit;
  warmups: WorkoutSet[];
  /** Working sets. */
  sets: WorkoutSet[];
  best: WorkoutSet | null;
  /** The best set's estimated max in `unit`: kg or lb sets with a weight above 0 only. Not rounded. */
  bestMax: number | null;
}

/** Every finished session of one exercise, newest first: one per workout entry of it. */
export function exerciseHistory(exerciseId: string, workouts: Workout[]): HistorySession[] {
  const sessions: (HistorySession & { startedAt: string })[] = [];
  for (const w of workouts) {
    if (w.deletedAt || w.finishedAt === undefined) continue;
    for (const entry of w.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      const warmups = entry.sets.filter((s) => s.done && s.warmup);
      const sets = entry.sets.filter(isWorkingSet);
      if (warmups.length === 0 && sets.length === 0) continue;
      const best = bestSet(sets);
      const counts = entry.unit !== 'plates' && best !== null && (best.weight ?? 0) > 0;
      sessions.push({
        workoutId: w.id,
        date: w.date,
        name: w.name,
        unit: entry.unit,
        warmups,
        sets,
        best,
        bestMax: counts ? estimatedMax(best.weight!, best.reps!) : null,
        startedAt: w.startedAt,
      });
    }
  }
  return sessions
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(({ startedAt: _startedAt, ...session }) => session);
}

const toKg = (value: number, unit: EntryUnit) => (unit === 'lb' ? value * KG_PER_LB : value);

/** The session with the highest estimated max across kg and lb, with that max given in `unit`. */
export function bestEver(sessions: HistorySession[], unit: ExerciseUnit): { session: HistorySession; max: number } | null {
  let best: { session: HistorySession; kg: number } | null = null;
  for (const session of sessions) {
    if (session.bestMax === null) continue;
    const kg = toKg(session.bestMax, session.unit);
    if (!best || kg > best.kg) best = { session, kg };
  }
  if (!best) return null;
  return { session: best.session, max: unit === 'lb' ? best.kg / KG_PER_LB : best.kg };
}

const num = (v: number | undefined) => (v === undefined ? '–' : String(v));

/** "80×6", or "80×6 @8" with an RPE. */
export function formatHistorySet(s: WorkoutSet): string {
  return `${num(s.weight)}×${num(s.reps)}${s.rpe !== undefined ? ` @${s.rpe}` : ''}`;
}
