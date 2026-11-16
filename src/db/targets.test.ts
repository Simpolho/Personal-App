import { beforeEach, expect, test } from 'vitest';
import { resetDb } from './db';
import { getTargetsFor, listTargets, setTargets } from './targets';

beforeEach(() => resetDb());

test('setTargets on the same day updates instead of adding', async () => {
  await setTargets('2026-11-16', { kcal: 2300 });
  await setTargets('2026-11-16', { kcal: 2200, protein: 160 });
  expect(await listTargets()).toHaveLength(1);
  expect(await getTargetsFor('2026-11-20')).toEqual({ kcal: 2200, protein: 160 });
});
test('a later change leaves earlier days with the targets they had', async () => {
  await setTargets('2026-11-01', { kcal: 2300, protein: 160 });
  await setTargets('2026-11-16', { kcal: 2100 });
  expect(await getTargetsFor('2026-11-10')).toEqual({ kcal: 2300, protein: 160 });
  expect(await getTargetsFor('2026-11-16')).toEqual({ kcal: 2100 });
});
