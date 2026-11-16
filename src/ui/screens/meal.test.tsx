import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import { createMeal, getDay, logFood, quickAdd } from '../../db/log';
import { listTemplates } from '../../db/templates';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  await db.tableFoods.put({ id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379, protein: 13.2 }, servings: [], searchKey: 'oats' });
});

test('rename, retime, save as saved meal, repeat it', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, 'Protein bar', { kcal: 210 });
  const first = renderAt(`#/meal/${m.id}`);

  const name = await screen.findByLabelText('Meal name');
  await user.clear(name);
  await user.type(name, 'Pre-workout');
  await user.tab();
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: '17:30' } });
  await waitFor(async () =>
    expect((await getDay('2026-11-16')).meals[0].meal).toMatchObject({ name: 'Pre-workout', time: '17:30' }));
  expect(await screen.findByRole('heading', { name: 'Pre-workout' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Save as saved meal' }));
  const savedName = await screen.findByLabelText('Saved meal name');
  expect(savedName).toHaveValue('Pre-workout');
  await user.clear(savedName);
  await user.type(savedName, 'Snack');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect((await listTemplates()).map((t) => t.name)).toEqual(['Snack']));
  first.unmount();

  vi.setSystemTime(new Date('2026-11-17T16:00:00Z'));
  renderAt('#/day/2026-11-17');
  await user.click(await screen.findByRole('button', { name: 'Log food' }));
  await user.click(screen.getByRole('button', { name: 'Repeat a saved meal' }));
  await user.click(await screen.findByRole('button', { name: /^Snack/ }));
  await waitFor(async () => {
    const day = await getDay('2026-11-17');
    expect(day.meals.map((x) => x.meal.name)).toEqual(['Snack']);
    expect(day.totals).toEqual({ kcal: 210 });
  });
  expect(await screen.findByText('Tue 17 Nov')).toBeInTheDocument();
});
test('deleting a meal asks first and removes it', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, undefined, { kcal: 300 });
  renderAt(`#/meal/${m.id}`);
  await user.click(await screen.findByRole('button', { name: 'Delete meal' }));
  expect((await getDay('2026-11-16')).meals).toHaveLength(1); // nothing happens until confirmed
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(async () => expect((await getDay('2026-11-16')).meals).toEqual([]));
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
});
test('cancelling the delete keeps the meal', async () => {
  const m = await createMeal('2026-11-16');
  renderAt(`#/meal/${m.id}`);
  await user.click(await screen.findByRole('button', { name: 'Delete meal' }));
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((await getDay('2026-11-16')).meals).toHaveLength(1);
});
test('tap an entry to change its amount (comma decimals work) or delete it', async () => {
  const m = await createMeal('2026-11-16');
  await logFood(m.id, 'usda:173904', 80, 'g');
  renderAt(`#/meal/${m.id}`);
  await user.click(await screen.findByText('Oats'));
  const amount = await screen.findByLabelText('Amount');
  expect(amount).toHaveValue('80');
  await user.clear(amount);
  await user.type(amount, '40,5');
  await user.click(screen.getByRole('button', { name: 'Save amount' }));
  await waitFor(async () => {
    const entry = (await getDay('2026-11-16')).meals[0].entries[0];
    expect(entry.amount).toBe(40.5);
    expect(entry.nutrientsSnapshot.kcal).toBeCloseTo(153.495);
  });
  await user.click(await screen.findByText('Oats'));
  await user.click(await screen.findByRole('button', { name: 'Delete entry' }));
  await waitFor(async () => expect((await getDay('2026-11-16')).meals[0].entries).toEqual([]));
});
