import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import type { Exercise } from '../../db/types';
import { saveExercise, saveRoutine } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

let bench: Exercise;
let raise: Exercise;

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  raise = await saveExercise({ name: 'Raise', muscle: 'Shoulders', unit: 'kg', eachSide: false, note: '' });
});

async function fill(label: string, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) {
  const field = scope.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}

test('the list leads to every routine and exercise, and to new ones', async () => {
  await saveRoutine({ name: 'Upper A', weekdays: [1], items: [] });
  renderAt('#/workouts/routines');
  expect(await screen.findByRole('link', { name: 'Upper A' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Bench' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New routine' })).toHaveAttribute('href', '#/routines/new');
  expect(screen.getByRole('link', { name: 'New exercise' })).toHaveAttribute('href', '#/exercises/new');
});

test('a routine is made with its weekdays and exercise targets', async () => {
  renderAt('#/routines/new');
  await fill('Name', 'Upper A');
  await user.click(screen.getByRole('checkbox', { name: 'Mon' }));
  await screen.findByRole('option', { name: 'Bench' });
  await user.selectOptions(screen.getByLabelText('Add exercise'), 'Bench');
  const item = within(await screen.findByRole('region', { name: 'Bench' }));
  await fill('Sets', '3', item);
  await fill('Reps from', '6', item);
  await fill('Reps to', '10', item);
  await fill('RPE target', '≤8', item);
  await fill('Starting weight', '22,5', item);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(window.location.hash).toBe('#/workouts/routines'));
  const [saved] = await db.routines.toArray();
  expect(saved).toMatchObject({
    name: 'Upper A',
    weekdays: [1],
    items: [{ exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 }],
  });
});

test('exercises in a routine can be reordered; bad reps are refused', async () => {
  const routine = await saveRoutine({
    name: 'Upper A',
    weekdays: [1],
    items: [
      { exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '' },
      { exerciseId: raise.id, sets: 2, repsMin: 12, repsMax: 15, rpeTarget: '' },
    ],
  });
  renderAt(`#/routines/${routine.id}`);
  const benchItem = within(await screen.findByRole('region', { name: 'Bench' }));
  await fill('Reps from', '12', benchItem);
  await fill('Reps to', '8', benchItem);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText("Bench: reps from can't be more than reps to")).toBeInTheDocument();
  expect((await db.routines.get(routine.id))?.items[0]).toMatchObject({ repsMin: 6, repsMax: 10 });
  await fill('Reps to', '15', benchItem);
  await user.click(within(screen.getByRole('region', { name: 'Raise' })).getByRole('button', { name: 'Move up' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect((await db.routines.get(routine.id))?.items.map((i) => i.exerciseId)).toEqual([raise.id, bench.id]));
});

test('the editor offers only kg and lb, and saving keeps an existing plate weight', async () => {
  await db.exercises.put({ ...bench, plateWeight: { value: 5, unit: 'kg' } }); // from when plates were a unit
  renderAt(`#/exercises/${bench.id}`);
  expect(await screen.findByLabelText('Name')).toHaveValue('Bench');
  const options = [...(screen.getByLabelText('Unit') as HTMLSelectElement).options].map((o) => o.value);
  expect(options).toEqual(['kg', 'lb']);
  expect(screen.queryByLabelText('1 plate =')).toBeNull();
  await user.click(screen.getByRole('checkbox', { name: 'Each side' }));
  await fill('Note', 'seat 4');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () =>
    expect(await db.exercises.get(bench.id)).toMatchObject({ unit: 'kg', plateWeight: { value: 5, unit: 'kg' }, eachSide: true, note: 'seat 4' }),
  );
});

test('an exercise a routine uses is not deleted, and says where it is used', async () => {
  await saveRoutine({ name: 'Upper A', weekdays: [1], items: [{ exerciseId: bench.id, sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '' }] });
  renderAt(`#/exercises/${bench.id}`);
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Used in Upper A — remove it there first')).toBeInTheDocument();
  expect((await db.exercises.get(bench.id))?.deletedAt).toBeUndefined();
});
