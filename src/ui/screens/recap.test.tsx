import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { resetDb } from '../../db/db';
import type { Exercise, Routine, Workout } from '../../db/types';
import { finishWorkout, newEntry, saveExercise, saveRoutine, saveWorkout, startWorkout } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
let legExt: Exercise;
let backExt: Exercise;
let lat: Exercise;
let upperA: Routine;

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  legExt = await saveExercise({ name: 'Leg extension', muscle: 'Quads', unit: 'plates', eachSide: false, note: '' });
  backExt = await saveExercise({ name: 'Back extension', muscle: 'Hamstrings', unit: 'bodyweight', eachSide: false, note: '' });
  lat = await saveExercise({ name: 'Lat pulldown', muscle: 'Back', unit: 'kg', eachSide: false, note: '' });
  upperA = await saveRoutine({ name: 'Upper A', weekdays: [1], items: [{ exerciseId: bench.id, sets: 2, repsMin: 6, repsMax: 10, rpeTarget: '' }] });
});

/** A finished Upper A on `date`, lasting 68 minutes, with the given sets per exercise (all ticked). */
async function done(date: string, sets: [Exercise, [number, number][]][]): Promise<Workout> {
  vi.setSystemTime(new Date(`${date}T10:00:00Z`));
  const w = await startWorkout({ routineId: upperA.id, date });
  const entries = [];
  for (const [exercise, values] of sets) {
    const e = await newEntry(exercise.id, w.startedAt, values.length);
    entries.push({ ...e, sets: e.sets.map((s, i) => ({ ...s, weight: values[i]![0], reps: values[i]![1], done: true })) });
  }
  await saveWorkout({ ...w, entries });
  return finishWorkout(w.id, new Date(new Date(w.startedAt).getTime() + 68 * 60_000).toISOString());
}

const muscleRow = (name: string) => within(screen.getByRole('listitem', { name }));

test('the first workout of a routine shows sets and volume per muscle group, with no comparison', async () => {
  const w = await done('2026-11-16', [[bench, [[60, 8], [60, 8]]]]);
  renderAt(`#/workout/${w.id}/recap`);
  expect(await screen.findByRole('heading', { name: 'Upper A · done · 68 min' })).toBeInTheDocument();
  expect(muscleRow('Chest').getByText('2 sets')).toBeInTheDocument();
  expect(muscleRow('Chest').getByText('960 kg')).toBeInTheDocument();
  expect(screen.queryByText(/▲|▼|^=$/)).toBeNull();
  expect(screen.queryByText(/vs last/)).toBeNull();
});

test('the next one is compared with the last workout of the same routine', async () => {
  await done('2026-11-16', [[bench, [[60, 8], [60, 8]]]]);
  const up = await done('2026-11-23', [[bench, [[60, 8], [60, 9]]]]);
  const view = renderAt(`#/workout/${up.id}/recap`);
  expect(await screen.findByText('vs last Upper A')).toBeInTheDocument();
  expect(muscleRow('Chest').getByText('1,020 kg')).toBeInTheDocument();
  expect(muscleRow('Chest').getByText('▲ 60')).toBeInTheDocument();
  view.unmount();
  const same = await done('2026-11-30', [[bench, [[60.05, 8], [60.05, 8]]]]);
  renderAt(`#/workout/${same.id}/recap`);
  await screen.findByText('vs last Upper A');
  expect(muscleRow('Chest').getByText('961 kg')).toBeInTheDocument();
  expect(muscleRow('Chest').getByText('▼ 59')).toBeInTheDocument();
});

test('a change under 1 kg shows as =', async () => {
  await done('2026-11-16', [[bench, [[60, 8], [60, 8]]]]);
  const w = await done('2026-11-23', [[bench, [[60.05, 8], [60, 8]]]]);
  renderAt(`#/workout/${w.id}/recap`);
  await screen.findByText('vs last Upper A');
  expect(muscleRow('Chest').getByText('=')).toBeInTheDocument();
});

test('plates without a plate weight are named, and count once the plate weight is set', async () => {
  const w = await done('2026-11-16', [[legExt, [[14, 12]]]]);
  renderAt(`#/workout/${w.id}/recap`);
  expect(await screen.findByText("Leg extension isn't in the volume: set its plate weight.")).toBeInTheDocument();
  expect(muscleRow('Quads').getByText('1 set')).toBeInTheDocument();
  expect(muscleRow('Quads').getByText('0 kg')).toBeInTheDocument();
  await saveExercise({ ...legExt, plateWeight: { value: 5, unit: 'kg' } }, legExt.id);
  await waitFor(() => expect(screen.queryByText(/Leg extension isn't in the volume/)).toBeNull());
  expect(muscleRow('Quads').getByText('840 kg')).toBeInTheDocument();
});

test('bodyweight with no weight logged asks for a weigh-in', async () => {
  const w = await done('2026-11-16', [[backExt, [[0, 12]]]]);
  renderAt(`#/workout/${w.id}/recap`);
  expect(await screen.findByText("Back extension isn't in the volume: log your weight first.")).toBeInTheDocument();
});

test('a swapped exercise counts toward its own muscle group', async () => {
  const w = await done('2026-11-16', [[lat, [[50, 10]]]]);
  renderAt(`#/workout/${w.id}/recap`);
  expect(await screen.findByRole('listitem', { name: 'Back' })).toBeInTheDocument();
  expect(screen.queryByRole('listitem', { name: 'Chest' })).toBeNull();
});

test('a finished workout links to its recap, and Done goes Home', async () => {
  const w = await done('2026-11-16', [[bench, [[60, 8]]]]);
  renderAt(`#/workout/${w.id}`);
  await user.click(await screen.findByRole('link', { name: 'Recap' }));
  expect(await screen.findByRole('heading', { name: 'Upper A · done · 68 min' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(window.location.hash).toBe('#/'));
});
