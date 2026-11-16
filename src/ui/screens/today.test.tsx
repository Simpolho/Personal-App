import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import { createMeal, getDay, quickAdd } from '../../db/log';
import { setTargets } from '../../db/targets';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
});

test('first launch: empty day, totals only, no bars', async () => {
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
  expect(screen.getByText('0 kcal')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('button', { name: 'Log food' })).toBeInTheDocument();
});
test('with a calorie target only, one bar and "x / y kcal"', async () => {
  await setTargets('2026-11-01', { kcal: 2300 });
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, undefined, { kcal: 1640 });
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('1640 / 2300 kcal')).toBeInTheDocument();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
});
test('the day lists its meals and what was eaten', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, 'Lunch out', { kcal: 700, protein: 35 });
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('Meal 1 · 10:00')).toBeInTheDocument();
  expect(screen.getByText('Lunch out')).toBeInTheDocument();
  expect(screen.getByText('35 g')).toBeInTheDocument(); // protein total, no target
});
test('Log food → New meal creates "Meal 1" and opens food search', async () => {
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('button', { name: 'Log food' }));
  await user.click(screen.getByRole('button', { name: 'New meal' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect((await getDay('2026-11-16')).meals[0].meal.name).toBe('Meal 1');
});
test('Log food offers the day\'s meals, and picking one opens it for adding', async () => {
  const m = await createMeal('2026-11-16');
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('button', { name: 'Log food' }));
  await user.click(await screen.findByRole('button', { name: 'Meal 1 · 10:00' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect(window.location.hash).toBe(`#/meal/${m.id}/add`);
});
test('arrows change the day and Day complete persists', async () => {
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('button', { name: 'Previous day' }));
  expect(await screen.findByText('Sun 15 Nov')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Day complete' }));
  await waitFor(async () => expect((await getDay('2026-11-15')).complete).toBe(true));
});
test('backup banner appears when a backup is due', async () => {
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
  await quickAdd((await createMeal('2026-10-01')).id, undefined, { kcal: 1 });
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText(/Last backup over 14 days ago/)).toBeInTheDocument();
});
test('no backup banner on a fresh install', async () => {
  renderAt('#/day/2026-11-16');
  await screen.findByText('Mon 16 Nov');
  expect(screen.queryByText(/Last backup/)).toBeNull();
});
test('the root route opens today', async () => {
  renderAt('#/');
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
});
test('an address that is not a date goes to today', async () => {
  renderAt('#/day/not-a-date');
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
});
test('reopening the app the next morning shows the new day, not yesterday', async () => {
  vi.setSystemTime(new Date('2026-11-16T22:00:00Z'));
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
  vi.setSystemTime(new Date('2026-11-17T08:00:00Z'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByText('Tue 17 Nov')).toBeInTheDocument();
});
test('reopening while looking at an earlier day stays on that day', async () => {
  renderAt('#/day/2026-11-10');
  expect(await screen.findByText('Tue 10 Nov')).toBeInTheDocument();
  vi.setSystemTime(new Date('2026-11-17T08:00:00Z'));
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByText('Tue 10 Nov')).toBeInTheDocument();
});
test('a screen that crashes shows a way out instead of a blank page', async () => {
  const m = await createMeal('2026-11-16');
  await db.logEntries.put({ id: 'broken', createdAt: 'x', updatedAt: 'x', mealId: m.id } as never); // as a bad record would
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '#/settings');
  quiet.mockRestore();
});
