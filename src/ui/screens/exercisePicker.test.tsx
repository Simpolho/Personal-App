import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import type { Exercise, Routine, Workout } from '../../db/types';
import { finishWorkout, newEntry, saveExercise, saveRoutine, saveWorkout, startWorkout } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
let raise: Exercise;
let lat: Exercise;
let upperA: Routine;
let w: Workout;

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  raise = await saveExercise({ name: 'Raise', muscle: 'Shoulders', unit: 'kg', eachSide: false, note: '' });
  lat = await saveExercise({ name: 'Lat pulldown', muscle: 'Back', unit: 'kg', eachSide: false, note: '' });
  await saveExercise({ name: 'Chest press', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  upperA = await saveRoutine({
    name: 'Upper A',
    weekdays: [1],
    items: [
      { exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 },
      { exerciseId: raise.id, sets: 2, repsMin: 12, repsMax: 15, rpeTarget: '8–9', startWeight: 4 },
    ],
  });
  // Lat pulldown was done last week: 50 × 10.
  const old = await startWorkout({ date: '2026-11-16' });
  const entry = await newEntry(lat.id, old.startedAt);
  await saveWorkout({ ...old, entries: [{ ...entry, sets: entry.sets.map((s) => ({ ...s, weight: 50, reps: 10, done: true })) }] });
  await finishWorkout(old.id);
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  w = await startWorkout({ routineId: upperA.id, date: '2026-11-23' });
});

const order = async () => {
  const saved = await db.workouts.get(w.id);
  const names = new Map((await db.exercises.toArray()).map((e) => [e.id, e.name]));
  return saved!.entries.map((e) => names.get(e.exerciseId));
};

test('an exercise is found by typing and added at the end, pre-filled from last time', async () => {
  renderAt(`#/workout/${w.id}`);
  await user.click(await screen.findByRole('button', { name: '+ Add exercise' }));
  await user.type(await screen.findByLabelText('Search exercises'), 'lat');
  expect(screen.queryByRole('button', { name: 'Bench' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Lat pulldown' }));
  const region = within(await screen.findByRole('region', { name: 'Lat pulldown' }));
  expect(window.location.hash).toBe(`#/workout/${w.id}`);
  expect(region.getByLabelText('Set 1 weight')).toHaveValue('50');
  expect(region.getByLabelText('Set 1 reps')).toHaveValue('10');
  expect(await order()).toEqual(['Bench', 'Raise', 'Lat pulldown']);
});

test('a new exercise can be made from the search and added', async () => {
  renderAt(`#/workout/${w.id}`);
  await user.click(await screen.findByRole('button', { name: '+ Add exercise' }));
  await user.type(await screen.findByLabelText('Search exercises'), 'Cable crunch');
  expect(screen.getByLabelText('Name')).toHaveValue('Cable crunch');
  await user.selectOptions(screen.getByLabelText('Muscle group'), 'Abs');
  await user.selectOptions(screen.getByLabelText('Unit'), 'kg');
  await user.click(screen.getByRole('button', { name: 'Create and add' }));
  expect(await screen.findByRole('region', { name: 'Cable crunch' })).toBeInTheDocument();
  const made = (await db.exercises.toArray()).find((e) => e.name === 'Cable crunch');
  expect(made).toMatchObject({ muscle: 'Abs', unit: 'kg', eachSide: false, note: '' });
  expect(await order()).toEqual(['Bench', 'Raise', 'Cable crunch']);
});

test('swapping keeps the place and the target, and leaves the routine alone', async () => {
  renderAt(`#/workout/${w.id}`);
  await user.click(await screen.findByRole('button', { name: 'Options for Bench' }));
  await user.click(screen.getByRole('button', { name: 'Swap' }));
  await user.click(await screen.findByRole('button', { name: 'Chest press' }));
  const region = within(await screen.findByRole('region', { name: 'Chest press' }));
  expect(region.getByText('3 × 6–10 · RPE ≤8')).toBeInTheDocument();
  expect(region.getByLabelText('Set 3 weight')).toBeInTheDocument();
  expect(await order()).toEqual(['Chest press', 'Raise']);
  expect((await db.routines.get(upperA.id))?.items.map((i) => i.exerciseId)).toEqual([bench.id, raise.id]);
});

test('exercises can be moved and removed', async () => {
  renderAt(`#/workout/${w.id}`);
  await user.click(await screen.findByRole('button', { name: 'Options for Raise' }));
  await user.click(screen.getByRole('button', { name: 'Move up' }));
  await waitFor(async () => expect(await order()).toEqual(['Raise', 'Bench']));
  await user.click(screen.getByRole('button', { name: 'Options for Bench' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
  await waitFor(async () => expect(await order()).toEqual(['Raise']));
  expect(screen.queryByRole('region', { name: 'Bench' })).toBeNull();
});
