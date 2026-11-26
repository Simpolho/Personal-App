import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { resetDb } from '../../db/db';
import { listWeights, logWeight } from '../../db/weight';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
});

const kg = async () => (await listWeights()).map((w) => [w.date, w.kg]);

test('with no weights yet, the form starts empty on today', async () => {
  renderAt('#/weight');
  expect(await screen.findByLabelText('Weight (kg)')).toHaveValue('');
  expect(screen.getByLabelText('Date')).toHaveValue('2026-11-23');
  expect(screen.getByText('No weighings yet')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Last 30 days' })).toBeNull();
});
test('the last weight is pre-filled, and a comma decimal saves', async () => {
  await logWeight('2026-11-20', 78.45);
  renderAt('#/weight');
  const field = await screen.findByLabelText('Weight (kg)');
  await waitFor(() => expect(field).toHaveValue('78.45'));
  await user.clear(field);
  await user.type(field, '78,1');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(async () => expect(await kg()).toEqual([['2026-11-20', 78.45], ['2026-11-23', 78.1]]));
  expect(await screen.findByText('Mon 23 Nov · 78.10 kg')).toBeInTheDocument();
});
test('impossible weights are refused', async () => {
  renderAt('#/weight');
  const field = await screen.findByLabelText('Weight (kg)');
  for (const bad of ['7810', '78.123']) {
    await user.clear(field);
    await user.type(field, bad);
    await user.click(screen.getByRole('button', { name: 'Save weight' }));
    expect(await screen.findByText('Enter a weight between 20 and 300 kg, with up to 2 decimals')).toBeInTheDocument();
  }
  expect(await kg()).toEqual([]);
});
test('a past date can be logged, and logging it again replaces it', async () => {
  renderAt('#/weight');
  const field = await screen.findByLabelText('Weight (kg)');
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-21' } });
  await user.type(field, '79');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(async () => expect(await kg()).toEqual([['2026-11-21', 79]]));
  await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue('2026-11-23'));
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-21' } });
  await user.clear(screen.getByLabelText('Weight (kg)'));
  await user.type(screen.getByLabelText('Weight (kg)'), '78.8');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(async () => expect(await kg()).toEqual([['2026-11-21', 78.8]]));
});
test('Edit loads an entry into the form; Delete asks first', async () => {
  await logWeight('2026-11-21', 79.2);
  await logWeight('2026-11-23', 78.5);
  renderAt('#/weight');
  await user.click(await screen.findByRole('button', { name: 'Edit Sat 21 Nov' }));
  expect(screen.getByLabelText('Date')).toHaveValue('2026-11-21');
  expect(screen.getByLabelText('Weight (kg)')).toHaveValue('79.20');
  await user.click(screen.getByRole('button', { name: 'Delete Sat 21 Nov' }));
  expect(await screen.findByRole('dialog', { name: 'Delete the weight for Sat 21 Nov?' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(async () => expect(await kg()).toEqual([['2026-11-23', 78.5]]));
});
test('the chart shows the last 30 days: a dot per weigh-in and the average line', async () => {
  await logWeight('2026-10-01', 82);
  await logWeight('2026-11-20', 79);
  await logWeight('2026-11-23', 78);
  renderAt('#/weight');
  const chart = await screen.findByRole('img', { name: 'Last 30 days' });
  expect(chart.querySelectorAll('[data-testid="weigh-in"]')).toHaveLength(2);
  expect(chart.querySelectorAll('[data-testid="average-line"]')).toHaveLength(1);
});
test('Back goes to Home', async () => {
  renderAt('#/weight');
  await user.click(await screen.findByRole('link', { name: 'Back' }));
  expect(await screen.findByRole('link', { name: 'Food log' })).toBeInTheDocument();
});
test('after saving, the confirmation stays and the form starts a new entry for today', async () => {
  renderAt('#/weight');
  await user.type(await screen.findByLabelText('Weight (kg)'), '78,6');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(() => expect(screen.getByLabelText('Weight (kg)')).toHaveValue('78.60'));
  expect(screen.getByLabelText('Date')).toHaveValue('2026-11-23');
  expect(screen.getByText('Saved 78.60 kg for Mon 23 Nov.')).toBeInTheDocument();
});
test('after saving an edit, the form goes back to a new entry for today', async () => {
  await logWeight('2026-11-21', 79.2);
  await logWeight('2026-11-23', 78.45);
  renderAt('#/weight');
  await user.click(await screen.findByRole('button', { name: 'Edit Sat 21 Nov' }));
  const field = screen.getByLabelText('Weight (kg)');
  await user.clear(field);
  await user.type(field, '79,1');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue('2026-11-23'));
  expect(screen.getByLabelText('Weight (kg)')).toHaveValue('78.45');
  expect(screen.getByText('Saved 79.10 kg for Sat 21 Nov.')).toBeInTheDocument();
  expect(await kg()).toEqual([['2026-11-21', 79.1], ['2026-11-23', 78.45]]);
});
test('a Weight screen left open overnight logs the morning weight on the new day', async () => {
  vi.setSystemTime(new Date('2026-11-23T07:00:00Z'));
  renderAt('#/weight');
  await user.type(await screen.findByLabelText('Weight (kg)'), '78,5');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(() => expect(screen.getByLabelText('Weight (kg)')).toHaveValue('78.50'));
  vi.setSystemTime(new Date('2026-11-24T07:00:00Z'));
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue('2026-11-24'));
  const field = screen.getByLabelText('Weight (kg)');
  await user.clear(field);
  await user.type(field, '78,2');
  await user.click(screen.getByRole('button', { name: 'Save weight' }));
  await waitFor(() => expect(screen.getByLabelText('Weight (kg)')).toHaveValue('78.20'));
  expect(screen.getByText('Saved 78.20 kg for Tue 24 Nov.')).toBeInTheDocument();
  expect(await kg()).toEqual([['2026-11-23', 78.5], ['2026-11-24', 78.2]]);
});
test('the date is shown by the app itself, centred, and follows the picker', async () => {
  renderAt('#/weight');
  const shown = await screen.findByText('Mon 23 Nov 2026');
  expect(shown).toHaveClass('justify-center');
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-21' } });
  expect(await screen.findByText('Sat 21 Nov 2026')).toBeInTheDocument();
});
