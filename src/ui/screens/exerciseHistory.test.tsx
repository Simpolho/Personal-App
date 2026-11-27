import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import type { EntryUnit, Exercise, Workout, WorkoutSet } from '../../db/types';
import { saveExercise } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
let n = 0;
const set = (weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: `s${++n}`, warmup: false, done: true, weight, reps, ...extra });
async function finished(id: string, date: string, name: string, unit: EntryUnit, sets: WorkoutSet[]): Promise<Workout> {
  const w: Workout = {
    id,
    date,
    name,
    startedAt: `${date}T10:00:00.000Z`,
    finishedAt: `${date}T11:00:00.000Z`,
    entries: [{ id: `e-${id}`, exerciseId: bench.id, unit, sets }],
    exerciseIds: [bench.id],
    createdAt: `${date}T11:00:00.000Z`,
    updatedAt: `${date}T11:00:00.000Z`,
  };
  await db.workouts.put(w);
  return w;
}

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
});

async function threeSessions() {
  await finished('w17', '2026-11-17', 'Upper A', 'kg', [set(40, 10, { warmup: true }), set(80, 6, { rpe: 8 }), set(80, 6), set(77.5, 7)]);
  await finished('w23', '2026-11-23', 'Lower A', 'plates', [set(14, 10), set(13, 10)]);
  await finished('w26', '2026-11-26', 'Upper B', 'kg', [set(77.5, 7)]);
}

test('history lists sessions newest first with sets, best set and estimated max', async () => {
  await threeSessions();
  renderAt(`#/exercises/${bench.id}/history`);
  expect(await screen.findByText('Best: 80 × 6 · est. max 96 kg (Tue 17 Nov)')).toBeInTheDocument();
  expect(screen.getByText('Chest · kg')).toBeInTheDocument();
  const sessions = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('#/workout/'));
  expect(sessions.map((a) => a.getAttribute('href'))).toEqual(['#/workout/w26', '#/workout/w23', '#/workout/w17']);
  const tue = within(screen.getByRole('link', { name: /Tue 17 Nov · Upper A/ }));
  expect(tue.getByText('W 40×10')).toBeInTheDocument();
  expect(tue.getByText('80×6 @8 · 80×6 · 77.5×7')).toBeInTheDocument();
  expect(tue.getByText('Best 80×6 · est. max 96')).toBeInTheDocument();
  const plates = within(screen.getByRole('link', { name: /Mon 23 Nov · Lower A/ }));
  expect(plates.getByText('14×10 · 13×10 · plates')).toBeInTheDocument();
  expect(plates.getByText('Best 14×10')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /Tue 17 Nov · Upper A/ }));
  await waitFor(() => expect(window.location.hash).toBe('#/workout/w17'));
});

test('an exercise never done says so and offers Edit', async () => {
  renderAt(`#/exercises/${bench.id}/history`);
  expect(await screen.findByText('No sessions yet.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `#/exercises/${bench.id}`);
  expect(screen.queryByText(/^Best:/)).toBeNull();
});

test('Routines & exercises opens the history, and Edit opens the editor', async () => {
  await threeSessions();
  renderAt('#/workouts/routines');
  await user.click(await screen.findByRole('link', { name: 'Bench' }));
  expect(await screen.findByRole('heading', { name: 'Bench' })).toBeInTheDocument();
  expect(await screen.findByText('Chest · kg')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Edit' }));
  expect(await screen.findByLabelText('Name')).toHaveValue('Bench');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Chest · kg')).toBeInTheDocument();
  expect(window.location.hash).toBe(`#/exercises/${bench.id}/history`);
});
