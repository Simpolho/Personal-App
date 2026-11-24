import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import type { Exercise, Routine } from '../../db/types';
import { finishWorkout, getActiveWorkout, saveExercise, saveRoutine, saveWorkout, startWorkout } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
const routines: Record<string, Routine> = {};

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  for (const [name, day] of [
    ['Upper A', 1],
    ['Lower A', 2],
    ['Upper B', 4],
    ['Lower B', 6],
  ] as const) {
    routines[name] = await saveRoutine({ name, weekdays: [day], items: [{ exerciseId: bench.id, sets: 1, repsMin: 8, repsMax: 8, rpeTarget: '' }] });
  }
});

/** A finished workout of `routine` on `date` lasting `minutes`. */
async function past(routine: string, date: string, minutes: number) {
  vi.setSystemTime(new Date(`${date}T10:00:00Z`));
  const w = await startWorkout({ routineId: routines[routine]!.id, date });
  await saveWorkout({ ...w, entries: w.entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, reps: 8, weight: 60, done: true })) })) });
  return finishWorkout(w.id, new Date(new Date(w.startedAt).getTime() + minutes * 60_000).toISOString());
}

test("Monday shows Upper A to start, and the other routines below", async () => {
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/workouts');
  const today = within(await screen.findByRole('region', { name: 'Today' }));
  expect(today.getByText('Today · Monday')).toBeInTheDocument();
  expect(await today.findByRole('button', { name: 'Start Upper A' })).toBeEnabled();
  const others = within(screen.getByRole('region', { name: 'Other routines' }));
  expect(others.getAllByRole('button', { name: /^Start / }).map((b) => b.getAttribute('aria-label'))).toEqual([
    'Start Lower A',
    'Start Lower B',
    'Start Upper B',
  ]);
  expect(others.getByRole('button', { name: 'Empty workout' })).toBeInTheDocument();
});

test('a day with nothing planned is a rest day', async () => {
  vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
  renderAt('#/workouts');
  expect(await within(await screen.findByRole('region', { name: 'Today' })).findByText('Rest day')).toBeInTheDocument();
});

test("starting today's routine opens the new workout", async () => {
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/workouts');
  await user.click(await screen.findByRole('button', { name: 'Start Upper A' }));
  await waitFor(async () => expect(await getActiveWorkout()).toBeDefined());
  const active = (await getActiveWorkout())!;
  await waitFor(() => expect(window.location.hash).toBe(`#/workout/${active.id}`));
  expect(active).toMatchObject({ name: 'Upper A', date: '2026-11-23' });
});

test('with a workout in progress, Resume is offered and nothing else can start', async () => {
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  const w = await startWorkout({ routineId: routines['Upper A']!.id, date: '2026-11-23' });
  renderAt('#/workouts');
  expect(await screen.findByRole('link', { name: 'Resume Upper A' })).toHaveAttribute('href', `#/workout/${w.id}`);
  expect(screen.getByRole('button', { name: 'Start Upper A' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Empty workout' })).toBeDisabled();
});

test('past workouts are listed newest first, with their length, and open', async () => {
  const b = await past('Upper B', '2026-11-20', 65);
  const lb = await past('Lower B', '2026-11-22', 71);
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/workouts');
  const list = within(await screen.findByRole('region', { name: 'Past workouts' }));
  const rows = await list.findAllByRole('link');
  expect(rows.map((r) => r.textContent)).toEqual(['Sun 22 Nov · Lower B · 71 min', 'Fri 20 Nov · Upper B · 65 min']);
  await user.click(rows[0]!);
  await waitFor(() => expect(window.location.hash).toBe(`#/workout/${lb.id}`));
  expect(b.id).toBeTruthy();
});

test('a workout can be logged afterwards for an earlier date; it has no length', async () => {
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/workouts');
  const form = within(await screen.findByRole('region', { name: 'Log a past workout' }));
  fireEvent.change(form.getByLabelText('Date'), { target: { value: '2026-11-20' } });
  await form.findByRole('option', { name: 'Upper B' });
  await user.selectOptions(form.getByLabelText('Routine'), 'Upper B');
  await user.click(form.getByRole('button', { name: 'Start past workout' }));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/workout\/[^/]+$/));
  const w = (await db.workouts.toArray())[0]!;
  expect(w).toMatchObject({ name: 'Upper B', date: '2026-11-20' });
  const region = within(await screen.findByRole('region', { name: 'Bench' }));
  await user.type(region.getByLabelText('Set 1 reps'), '8');
  await user.click(region.getByRole('button', { name: 'Done set 1' }));
  await user.click(screen.getByRole('button', { name: 'Finish' }));
  expect(await screen.findByRole('heading', { name: 'Upper B · done' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  renderAt('#/workouts');
  const rows = await within(await screen.findByRole('region', { name: 'Past workouts' })).findAllByRole('link');
  expect(rows.map((r) => r.textContent)).toEqual(['Fri 20 Nov · Upper B']);
});
