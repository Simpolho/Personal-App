import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { resetDb } from '../../db/db';
import { createMeal, quickAdd } from '../../db/log';
import { addWater, waterTotal } from '../../db/water';
import { logWeight } from '../../db/weight';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
});

test('the app opens on Home: today, calories, water, weight and the way to the food log', async () => {
  renderAt('#/');
  expect(await screen.findByRole('heading', { name: 'Mon 23 Nov' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Totals' })).toBeInTheDocument();
  expect(await screen.findByText('0 / 2 L')).toBeInTheDocument();
  expect(await screen.findByText('No weight yet')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Food log' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '+ Log food' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByText(/Workouts/)).toBeNull();
});
test('water buttons add up, and Undo takes back the last tap', async () => {
  renderAt('#/');
  expect(await screen.findByRole('button', { name: 'Undo' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '+250 ml' }));
  await user.click(screen.getByRole('button', { name: '+250 ml' }));
  await user.click(screen.getByRole('button', { name: '+500 ml' }));
  expect(await screen.findByText('1 / 2 L')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('0.5 / 2 L')).toBeInTheDocument();
  expect(await waterTotal('2026-11-23')).toBe(500);
});
test("yesterday's water doesn't count today", async () => {
  await addWater('2026-11-22', 750);
  renderAt('#/');
  expect(await screen.findByText('0 / 2 L')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
test('the weight card shows the latest weight, the 7-day average, the weekly change, and the nudge', async () => {
  await logWeight('2026-11-10', 81);
  await logWeight('2026-11-12', 82);
  await logWeight('2026-11-17', 80);
  await logWeight('2026-11-22', 78);
  renderAt('#/');
  expect(await screen.findByText('78.00 kg')).toBeInTheDocument();
  expect(screen.getByText('7-day avg 79.00 kg')).toBeInTheDocument();
  expect(screen.getByText('−2.50 kg/wk')).toBeInTheDocument();
  expect(screen.getByText('Not weighed today')).toBeInTheDocument();
  await logWeight('2026-11-23', 77.5);
  await waitFor(() => expect(screen.queryByText('Not weighed today')).toBeNull());
  expect(await screen.findByText('77.50 kg')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Weight' })).toHaveAttribute('href', '#/weight');
});
test("today's food shows on Home", async () => {
  await quickAdd((await createMeal('2026-11-23')).id, 'Lunch', { kcal: 700 });
  renderAt('#/');
  expect(await screen.findByText('700 kcal')).toBeInTheDocument();
});
test('Food log and + Log food lead where they say', async () => {
  const view = renderAt('#/');
  await user.click(await screen.findByRole('link', { name: 'Food log' }));
  expect(await screen.findByRole('checkbox', { name: 'Day complete' })).toBeInTheDocument();
  view.unmount();
  renderAt('#/');
  await user.click(await screen.findByRole('link', { name: '+ Log food' }));
  expect(await screen.findByRole('button', { name: 'New meal' })).toBeInTheDocument();
});
test('the backup reminder shows on Home when a backup is due', async () => {
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
  await quickAdd((await createMeal('2026-10-01')).id, undefined, { kcal: 1 });
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
  renderAt('#/');
  expect(await screen.findByText('Last backup over 14 days ago — Export now')).toBeInTheDocument();
});
test('opening the app after midnight shows the new day, with no water yet', async () => {
  vi.setSystemTime(new Date('2026-11-23T22:00:00Z'));
  await addWater('2026-11-23', 500);
  renderAt('#/');
  expect(await screen.findByText('0.5 / 2 L')).toBeInTheDocument();
  vi.setSystemTime(new Date('2026-11-24T08:00:00Z'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await screen.findByRole('heading', { name: 'Tue 24 Nov' })).toBeInTheDocument();
  expect(await screen.findByText('0 / 2 L')).toBeInTheDocument();
});
