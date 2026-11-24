// Its own file: the jump back into a workout happens only on the first Home of a page load.
import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { resetDb } from '../../db/db';
import { saveExercise, saveRoutine, startWorkout } from '../../db/workouts';
import { renderAt, user } from '../../test/render';

test('opening the app during a workout goes straight back to it, and going Home later stays there', async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T09:50:00Z'));
  const bench = await saveExercise({ name: 'Bench', muscle: 'Chest', unit: 'kg', eachSide: false, note: '' });
  const routine = await saveRoutine({ name: 'Upper A', weekdays: [1], items: [{ exerciseId: bench.id, sets: 1, repsMin: 8, repsMax: 8, rpeTarget: '' }] });
  const w = await startWorkout({ routineId: routine.id, date: '2026-11-23' });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  window.history.replaceState(null, '', '#/');
  renderAt('#/');
  await waitFor(() => expect(window.location.hash).toBe(`#/workout/${w.id}`));
  await screen.findByRole('region', { name: 'Bench' });
  await user.click(await screen.findByRole('link', { name: 'Back' }));
  await screen.findByRole('heading', { name: 'Workouts' });
  await user.click(await screen.findByRole('link', { name: 'Back' }));
  expect(await screen.findByRole('link', { name: 'Resume workout' })).toHaveAttribute('href', `#/workout/${w.id}`);
  await new Promise((r) => setTimeout(r, 50));
  expect(window.location.hash).not.toContain('/workout/');
});
