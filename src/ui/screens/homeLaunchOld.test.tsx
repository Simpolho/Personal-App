// Its own file: the jump back into a workout happens only on the first Home of a page load.
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { resetDb } from '../../db/db';
import { startWorkout } from '../../db/workouts';
import { renderAt } from '../../test/render';

test('a workout left more than 3 hours ago is offered, not opened', async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T05:00:00Z'));
  const w = await startWorkout({ date: '2026-11-23' });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/');
  expect(await screen.findByRole('link', { name: 'Resume workout' })).toHaveAttribute('href', `#/workout/${w.id}`);
  await new Promise((r) => setTimeout(r, 50));
  expect(window.location.hash).toBe('#/');
});
