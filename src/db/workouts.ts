import { nowIso } from '../domain/dates';
import { finishedVersion, isWorkingSet, prefillSets } from '../domain/workouts';
import { db } from './db';
import { isLive, newRecord, softDeleted, touched } from './records';
import { exerciseHistory, type HistorySession } from '../domain/history';
import type { BaseRecord, EntryUnit, Exercise, ExerciseUnit, Routine, Workout, WorkoutEntry, WorkoutSet } from './types';

export type ExerciseFields = Omit<Exercise, keyof BaseRecord>;
export type RoutineFields = Omit<Routine, keyof BaseRecord>;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Saves a new exercise, or replaces an existing one's fields (a field left out is cleared). */
export async function saveExercise(fields: ExerciseFields, id?: string): Promise<Exercise> {
  const existing = id ? await db.exercises.get(id) : undefined;
  const record: Exercise = existing
    ? touched({ id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt, ...fields })
    : newRecord(fields);
  await db.exercises.put(record);
  return record;
}

/** Live exercises, by name. */
export async function listExercises(): Promise<Exercise[]> {
  return (await db.exercises.toArray()).filter(isLive).sort(byName);
}

/** Deletes an exercise unless a routine still uses it; then it returns those routines' names. */
export async function deleteExercise(id: string): Promise<{ usedIn: string[] }> {
  const usedIn = (await listRoutines()).filter((r) => r.items.some((i) => i.exerciseId === id)).map((r) => r.name);
  if (usedIn.length > 0) return { usedIn };
  const existing = await db.exercises.get(id);
  if (existing && isLive(existing)) await db.exercises.put(softDeleted(existing));
  return { usedIn: [] };
}

export async function setExerciseNote(id: string, note: string): Promise<void> {
  const existing = await db.exercises.get(id);
  if (existing && existing.note !== note) await db.exercises.put(touched({ ...existing, note }));
}

/** The unit chosen during a workout becomes the exercise's unit for next time. */
export async function setExerciseUnit(id: string, unit: ExerciseUnit): Promise<void> {
  const existing = await db.exercises.get(id);
  if (existing && existing.unit !== unit) await db.exercises.put(touched({ ...existing, unit }));
}

export async function saveRoutine(fields: RoutineFields, id?: string): Promise<Routine> {
  const existing = id ? await db.routines.get(id) : undefined;
  const record: Routine = existing
    ? touched({ id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt, ...fields })
    : newRecord(fields);
  await db.routines.put(record);
  return record;
}

export async function listRoutines(): Promise<Routine[]> {
  return (await db.routines.toArray()).filter(isLive).sort(byName);
}

export async function deleteRoutine(id: string): Promise<void> {
  const existing = await db.routines.get(id);
  if (existing && isLive(existing)) await db.routines.put(softDeleted(existing));
}

const finished = (w: Workout) => isLive(w) && w.finishedAt !== undefined;

/** The workout in progress, if any. */
export async function getActiveWorkout(): Promise<Workout | undefined> {
  return (await db.workouts.orderBy('startedAt').reverse().toArray()).find((w) => isLive(w) && w.finishedAt === undefined);
}

/**
 * The working sets of `exerciseId` in the most recent finished workout that started before
 * `before` and has any, in whichever routine, logged in `unit` when given. Null when there is none.
 */
export async function lastSetsFor(exerciseId: string, before: string, excludeId?: string, unit?: EntryUnit): Promise<WorkoutSet[] | null> {
  const candidates = (await db.workouts.where('exerciseIds').equals(exerciseId).distinct().toArray())
    .filter((w) => finished(w) && w.startedAt < before && w.id !== excludeId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const w of candidates) {
    // Only sets logged in `unit` (the exercise's unit now): "14" plates isn't 14 kg.
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId && (unit === undefined || e.unit === unit)).flatMap((e) => e.sets.filter(isWorkingSet));
    if (sets.length > 0) return sets;
  }
  return null;
}

/** Every finished session of an exercise, newest first, for its history screen. */
export async function getExerciseHistory(exerciseId: string): Promise<HistorySession[]> {
  return exerciseHistory(exerciseId, await db.workouts.where('exerciseIds').equals(exerciseId).distinct().toArray());
}

/** A new entry for an exercise added mid-workout: `count` sets (one by default), pre-filled from last time. */
export async function newEntry(exerciseId: string, before: string, count = 1): Promise<WorkoutEntry> {
  const exercise = await db.exercises.get(exerciseId);
  if (!exercise) throw new Error('Unknown exercise');
  return {
    id: crypto.randomUUID(),
    exerciseId,
    unit: exercise.unit,
    sets: prefillSets(count, await lastSetsFor(exerciseId, before, undefined, exercise.unit)),
  };
}

/** Starts a workout from a routine (pre-filled) or empty. Only one can be in progress. */
export async function startWorkout(opts: { routineId?: string; date: string; startedAt?: string }): Promise<Workout> {
  if (await getActiveWorkout()) throw new Error('A workout is already in progress');
  const startedAt = opts.startedAt ?? nowIso();
  const routine = opts.routineId ? await db.routines.get(opts.routineId) : undefined;
  const entries: WorkoutEntry[] = [];
  for (const item of routine?.items ?? []) {
    const exercise = await db.exercises.get(item.exerciseId);
    if (!exercise || !isLive(exercise)) continue;
    const { exerciseId, startWeight, ...target } = item;
    entries.push({
      id: crypto.randomUUID(),
      exerciseId,
      unit: exercise.unit,
      target,
      sets: prefillSets(item.sets, await lastSetsFor(exerciseId, startedAt, undefined, exercise.unit), startWeight),
    });
  }
  const workout: Workout = newRecord({
    date: opts.date,
    name: routine?.name ?? 'Workout',
    ...(routine ? { routineId: routine.id } : {}),
    startedAt,
    entries,
    exerciseIds: [...new Set(entries.map((e) => e.exerciseId))],
  });
  await db.workouts.put(workout);
  return workout;
}

/** Saves a workout as it now is; `exerciseIds` follows its entries. */
export async function saveWorkout(w: Workout): Promise<Workout> {
  const record = touched({ ...w, exerciseIds: [...new Set(w.entries.map((e) => e.exerciseId))] });
  await db.workouts.put(record);
  return record;
}

/** Keeps the ticked sets (and entries that still have one) and marks the workout finished. */
export async function finishWorkout(id: string, finishedAt?: string): Promise<Workout> {
  const w = await db.workouts.get(id);
  if (!w || !isLive(w)) throw new Error('No such workout');
  const finished = finishedVersion(w, finishedAt ?? nowIso());
  if (!finished) throw new Error('Nothing is ticked');
  return saveWorkout(finished);
}

export async function deleteWorkout(id: string): Promise<void> {
  const existing = await db.workouts.get(id);
  if (existing && isLive(existing)) await db.workouts.put(softDeleted(existing));
}

/** Finished workouts, newest first. */
export async function listFinishedWorkouts(): Promise<Workout[]> {
  return (await db.workouts.orderBy('startedAt').reverse().toArray()).filter(finished);
}

/** The last finished workout of a routine that started before `before`. */
export async function previousRoutineWorkout(routineId: string, before: string): Promise<Workout | undefined> {
  return (await listFinishedWorkouts()).find((w) => w.routineId === routineId && w.startedAt < before);
}
