import { beforeEach, expect, test, vi } from 'vitest';
import { resetDb } from './db';
import { bodyKgOn, deleteWeight, listWeights, logWeight } from './weight';

beforeEach(() => resetDb());

test('one weight per day: logging again replaces it and keeps when it was first made', async () => {
  const first = await logWeight('2026-11-23', 78.45);
  vi.setSystemTime(new Date(Date.now() + 60_000));
  await logWeight('2026-11-23', 78.1);
  const all = await listWeights();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ id: '2026-11-23', date: '2026-11-23', kg: 78.1, createdAt: first.createdAt });
});
test('a deleted weight can be logged again', async () => {
  await logWeight('2026-11-23', 78.45);
  await deleteWeight('2026-11-23');
  expect(await listWeights()).toEqual([]);
  await logWeight('2026-11-23', 77.9);
  expect((await listWeights()).map((x) => [x.date, x.kg, x.deletedAt])).toEqual([['2026-11-23', 77.9, undefined]]);
});
test('weights come back oldest first', async () => {
  await logWeight('2026-11-23', 78);
  await logWeight('2026-11-01', 80);
  await logWeight('2026-11-12', 79);
  expect((await listWeights()).map((x) => x.date)).toEqual(['2026-11-01', '2026-11-12', '2026-11-23']);
});
test('body weight on a date is the latest weigh-in on or before it', async () => {
  await logWeight('2026-11-20', 80);
  await logWeight('2026-11-22', 79);
  expect(await bodyKgOn('2026-11-21')).toBe(80);
  expect(await bodyKgOn('2026-11-23')).toBe(79);
  expect(await bodyKgOn('2026-11-19')).toBeNull();
});
