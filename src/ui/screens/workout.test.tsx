import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import type { Exercise, Routine, Workout } from '../../db/types';
import { finishWorkout, saveExercise, saveRoutine, saveWorkout, startWorkout } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
let raise: Exercise;
let upperA: Routine;

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: 'elbows in' });
  raise = await saveExercise({ name: 'Raise', muscle: 'Shoulders', unit: 'lb', eachSide: false, note: '' });
  upperA = await saveRoutine({
    name: 'Upper A',
    weekdays: [1],
    items: [
      { exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 },
      { exerciseId: raise.id, sets: 2, repsMin: 12, repsMax: 15, rpeTarget: '8–9', startWeight: 10 },
    ],
  });
});

/** A finished Upper A on 2026-11-16 with Bench 25×8, 25×7. */
async function history() {
  const w = await startWorkout({ routineId: upperA.id, date: '2026-11-16' });
  const entries = w.entries.map((e, i) =>
    i === 0 ? { ...e, sets: e.sets.slice(0, 2).map((s, j) => ({ ...s, weight: 25, reps: j === 0 ? 8 : 7, done: true })) } : e,
  );
  await saveWorkout({ ...w, entries });
  await finishWorkout(w.id);
}

async function start(at = '2026-11-23T10:00:00Z'): Promise<Workout> {
  vi.setSystemTime(new Date(at));
  return startWorkout({ routineId: upperA.id, date: '2026-11-23' });
}
const stored = async (id: string) => (await db.workouts.get(id))!;
const exerciseRegion = (name: string) => screen.findByRole('region', { name });

test('shows each exercise with its target, last time, note and pre-filled sets', async () => {
  await history();
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  expect(b.getByText('3 × 6–10 · RPE ≤8')).toBeInTheDocument();
  expect(await b.findByText('Last: 25×8, 25×7')).toBeInTheDocument();
  expect(b.getByLabelText('Note')).toHaveValue('elbows in');
  expect(b.getByLabelText('Set 1 weight')).toHaveValue('25');
  expect(b.getByLabelText('Set 1 reps')).toHaveValue('8');
  expect(b.getByLabelText('Set 3 reps')).toHaveValue('7');
  const r = within(await exerciseRegion('Raise'));
  expect(r.getByLabelText('Set 1 weight')).toHaveValue('10');
  expect(r.getByLabelText('Set 1 reps')).toHaveValue('');
  expect(screen.getByRole('heading', { name: 'Upper A' })).toBeInTheDocument();
});

test('a set done as planned is one tap', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  expect(b.getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[0]?.done).toBe(true));
});

test('typed reps are kept; a weight that is not a number is not saved', async () => {
  await history();
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.clear(b.getByLabelText('Set 2 reps'));
  await user.type(b.getByLabelText('Set 2 reps'), '9');
  await user.click(b.getByRole('button', { name: 'Done set 2' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[1]).toMatchObject({ reps: 9, done: true }));
  await user.clear(b.getByLabelText('Set 3 weight'));
  await user.type(b.getByLabelText('Set 3 weight'), 'abc');
  expect(b.getByLabelText('Set 3 weight')).toHaveAttribute('aria-invalid', 'true');
  await new Promise((r) => setTimeout(r, 50));
  expect((await stored(w.id)).entries[0]?.sets[2]?.weight).toBe(25);
});

test('quick taps on several sets are all kept', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await user.click(b.getByRole('button', { name: 'Done set 2' }));
  await user.click(b.getByRole('button', { name: 'Done set 3' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets.map((s) => s.done)).toEqual([true, true, true]));
});

test('RPE is picked under a ticked set, and tapping it again clears it', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await user.click(b.getByRole('button', { name: 'RPE 8 for set 1' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[0]?.rpe).toBe(8));
  expect(b.getByRole('button', { name: 'RPE 8 for set 1' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(b.getByRole('button', { name: 'RPE 8 for set 1' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[0]?.rpe).toBeUndefined());
});

test('warm-ups go first; + Set copies the last set; a set can be removed', async () => {
  await history();
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.click(b.getByRole('button', { name: '+ Warm-up' }));
  expect(b.getByLabelText('Warm-up 1 weight')).toHaveValue('');
  await user.click(b.getByRole('button', { name: '+ Set' }));
  expect(b.getByLabelText('Set 4 weight')).toHaveValue('25');
  expect(b.getByLabelText('Set 4 reps')).toHaveValue('7');
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets.map((s) => s.warmup)).toEqual([true, false, false, false, false]));
  await user.click(b.getByRole('button', { name: 'Remove set 4' }));
  expect(b.queryByLabelText('Set 4 weight')).toBeNull();
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets).toHaveLength(4));
});

test("the note belongs to the exercise and shows next time", async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const r = within(await exerciseRegion('Raise'));
  await user.type(r.getByLabelText('Note'), 'seat 4');
  await user.tab();
  await waitFor(async () => expect((await db.exercises.get(raise.id))?.note).toBe('seat 4'));
});

test('everything typed is saved as you go, ticked or not', async () => {
  const w = await start();
  const view = renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.type(b.getByLabelText('Set 1 reps'), '10');
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await user.type(b.getByLabelText('Set 2 reps'), '9');
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[1]?.reps).toBe(9));
  view.unmount();
  renderAt(`#/workout/${w.id}`);
  const again = within(await exerciseRegion('Bench'));
  expect(again.getByLabelText('Set 1 reps')).toHaveValue('10');
  expect(again.getByRole('button', { name: 'Done set 1' })).toHaveAttribute('aria-pressed', 'true');
  expect(again.getByLabelText('Set 2 reps')).toHaveValue('9');
});

test('Finish keeps the ticked sets and opens the recap', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.type(b.getByLabelText('Set 1 reps'), '8');
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await user.click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(window.location.hash).toBe(`#/workout/${w.id}/recap`));
  const saved = await stored(w.id);
  expect(saved.finishedAt).toBeDefined();
  expect(saved.entries.map((e) => e.sets.length)).toEqual([1]);
});

test('Finish with nothing ticked offers to discard the workout', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  await exerciseRegion('Bench');
  await user.click(screen.getByRole('button', { name: 'Finish' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Discard workout' }));
  await waitFor(() => expect(window.location.hash).toBe('#/workouts'));
  expect((await stored(w.id)).deletedAt).toBeDefined();
});

test('a workout running past midnight stays open and keeps its date', async () => {
  const w = await start('2026-11-23T23:30:00Z');
  renderAt(`#/workout/${w.id}`);
  await exerciseRegion('Bench');
  vi.setSystemTime(new Date('2026-11-24T00:30:00Z'));
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(window.location.hash).toBe(`#/workout/${w.id}`);
  expect(screen.getByRole('region', { name: 'Bench' })).toBeInTheDocument();
  expect((await stored(w.id)).date).toBe('2026-11-23');
});

test('a finished workout can be corrected, moved to another date, or deleted', async () => {
  await history();
  const [done] = await db.workouts.toArray();
  renderAt(`#/workout/${done!.id}`);
  const b = within(await exerciseRegion('Bench'));
  expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  await user.clear(b.getByLabelText('Set 1 weight'));
  await user.type(b.getByLabelText('Set 1 weight'), '27,5');
  await waitFor(async () => expect((await stored(done!.id)).entries[0]?.sets[0]?.weight).toBe(27.5));
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-14' } });
  await waitFor(async () => expect((await stored(done!.id)).date).toBe('2026-11-14'));
  const moved = await stored(done!.id);
  expect(moved.startedAt).toBe(new Date(new Date(done!.startedAt).getTime() - 2 * 86_400_000).toISOString());
  expect(new Date(moved.finishedAt!).getTime() - new Date(moved.startedAt).getTime()).toBe(
    new Date(done!.finishedAt!).getTime() - new Date(done!.startedAt).getTime(),
  );
  await user.click(screen.getByRole('button', { name: 'Delete workout' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(window.location.hash).toBe('#/workouts'));
  expect((await stored(done!.id)).deletedAt).toBeDefined();
});
test('a save that fails is shown, can be retried, and Finish keeps what the screen shows', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.type(b.getByLabelText('Set 1 reps'), '8');
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[0]?.done).toBe(true));
  await user.clear(b.getByLabelText('Set 2 reps'));
  await user.type(b.getByLabelText('Set 2 reps'), '7');
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[1]?.reps).toBe(7));
  const put = vi.spyOn(db.workouts, 'put').mockRejectedValueOnce(new Error('connection closed'));
  await user.click(b.getByRole('button', { name: 'Done set 2' }));
  expect(await screen.findByText('Not saved')).toBeInTheDocument();
  put.mockRestore();
  await user.click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(window.location.hash).toBe(`#/workout/${w.id}/recap`));
  const saved = await stored(w.id);
  expect(saved.finishedAt).toBeDefined();
  expect(saved.entries[0]?.sets.map((s) => s.reps)).toEqual([8, 7]);
});

test('Retry saves the latest sets after a failed save', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await waitFor(async () => expect(await stored(w.id)).toBeDefined());
  const put = vi.spyOn(db.workouts, 'put').mockRejectedValueOnce(new Error('connection closed'));
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await screen.findByText('Not saved');
  put.mockRestore();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByText('Not saved')).toBeNull());
  expect((await stored(w.id)).entries[0]?.sets[0]?.done).toBe(true);
});

test('ticking sets does not look through past workouts again', async () => {
  await history();
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await b.findByText('Last: 25×8, 25×7');
  const where = vi.spyOn(db.workouts, 'where');
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  await user.click(b.getByRole('button', { name: 'Done set 2' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[1]?.done).toBe(true));
  await new Promise((r) => setTimeout(r, 50));
  expect(where).not.toHaveBeenCalled();
  where.mockRestore();
});

test('removing a ticked set asks first; RPE buttons are full-size tap targets', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  await user.click(b.getByRole('button', { name: 'Done set 1' }));
  expect(b.getByRole('button', { name: 'RPE 8 for set 1' }).className).toMatch(/min-h-11/);
  await user.click(b.getByRole('button', { name: 'Remove set 1' }));
  const dialog = await screen.findByRole('dialog');
  expect(b.getByLabelText('Set 1 weight')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets).toHaveLength(2));
});

test('a weight typed with a decimal comma is not marked wrong halfway', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const b = within(await exerciseRegion('Bench'));
  const field = b.getByLabelText('Set 1 weight');
  await user.clear(field);
  await user.type(field, '18,');
  expect(field).not.toHaveAttribute('aria-invalid');
  await user.type(field, '1');
  await waitFor(async () => expect((await stored(w.id)).entries[0]?.sets[0]?.weight).toBe(18.1));
  expect(field).not.toHaveAttribute('aria-invalid');
});
test("a finished workout's date is shown by the app itself, centred", async () => {
  await history();
  const [done] = await db.workouts.toArray();
  renderAt(`#/workout/${done!.id}`);
  expect(await screen.findByText('Mon 16 Nov 2026')).toHaveClass('justify-center');
});

test('kg / lb can be switched mid-workout, and the exercise remembers it', async () => {
  const w = await start();
  renderAt(`#/workout/${w.id}`);
  const region = await exerciseRegion('Bench');
  await user.click(within(region).getByRole('button', { name: 'Options for Bench' }));
  const units = within(region).getByRole('radiogroup', { name: 'Unit' });
  expect(within(units).getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
  await user.click(within(units).getByRole('radio', { name: 'lb' }));
  await waitFor(async () => expect((await stored(w.id)).entries[0]!.unit).toBe('lb'));
  expect((await stored(w.id)).entries[0]!.sets.map((s) => s.weight)).toEqual([22.5, 22.5, 22.5]);
  expect(within(region).getAllByText('lb').length).toBeGreaterThanOrEqual(3);
  await waitFor(async () => expect((await db.exercises.get(bench.id))!.unit).toBe('lb'));
});

test('on a finished workout the switch corrects only that workout', async () => {
  await history();
  const done = (await db.workouts.toArray())[0]!;
  renderAt(`#/workout/${done.id}`);
  const region = await exerciseRegion('Bench');
  await user.click(within(region).getByRole('button', { name: 'Options for Bench' }));
  await user.click(within(within(region).getByRole('radiogroup', { name: 'Unit' })).getByRole('radio', { name: 'lb' }));
  await waitFor(async () => expect((await stored(done.id)).entries[0]!.unit).toBe('lb'));
  expect((await db.exercises.get(bench.id))!.unit).toBe('kg');
});

test('a finished plates entry has no unit switch', async () => {
  await history();
  const done = (await db.workouts.toArray())[0]!;
  await db.workouts.put({ ...done, entries: done.entries.map((e, i) => (i === 0 ? { ...e, unit: 'plates' as const } : e)) });
  renderAt(`#/workout/${done.id}`);
  const region = await exerciseRegion('Bench');
  await user.click(within(region).getByRole('button', { name: 'Options for Bench' }));
  expect(within(region).getByRole('button', { name: 'Swap' })).toBeInTheDocument();
  expect(within(region).queryByRole('radiogroup', { name: 'Unit' })).toBeNull();
});
