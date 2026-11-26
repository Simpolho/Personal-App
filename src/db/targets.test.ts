import { beforeEach, expect, test } from 'vitest';
import { resetDb } from './db';
import { createMeal, quickAdd, setDayKind } from './log';
import { getDayTargets, getTargetSetsFor, getTargetsFor, listTargets, setTargets } from './targets';
import { deleteRoutine, saveRoutine } from './workouts';

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
test('setTargets keeps a rest set, and an empty one is not stored', async () => {
  await setTargets('2026-11-16', { kcal: 2400 }, { kcal: 2000 });
  expect(await getTargetSetsFor('2026-11-20')).toEqual({ main: { kcal: 2400 }, rest: { kcal: 2000 } });
  await setTargets('2026-11-16', { kcal: 2400 });
  const list = await listTargets();
  expect(list).toHaveLength(1);
  expect(list[0].rest).toBeUndefined();
});
test('getDayTargets follows the weekly plan until the day is switched', async () => {
  await saveRoutine({ name: 'Upper', weekdays: [1], items: [] });
  await setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 });
  expect(await getDayTargets('2026-11-16')).toEqual({ targets: { kcal: 2400 }, kind: 'training', split: true });
  expect(await getDayTargets('2026-11-17')).toEqual({ targets: { kcal: 2000 }, kind: 'rest', split: true });
  await setDayKind('2026-11-16', 'rest');
  expect(await getDayTargets('2026-11-16')).toEqual({ targets: { kcal: 2000 }, kind: 'rest', split: true });
  expect(await getTargetsFor('2026-11-16')).toEqual({ kcal: 2000 });
});
test('a deleted routine does not make a training day', async () => {
  const r = await saveRoutine({ name: 'Lower', weekdays: [2], items: [] });
  await deleteRoutine(r.id);
  expect((await getDayTargets('2026-11-17')).kind).toBe('rest');
});
test('with one set there is no switch and every day uses it', async () => {
  await setTargets('2026-11-01', { kcal: 2300 });
  expect(await getDayTargets('2026-11-17')).toEqual({ targets: { kcal: 2300 }, kind: 'rest', split: false });
});
test('a day with food keeps its kind when the weekly plan changes later', async () => {
  const upper = await saveRoutine({ name: 'Upper', weekdays: [1], items: [] });
  await setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 });
  await quickAdd((await createMeal('2026-11-16')).id, undefined, { kcal: 500 });
  await saveRoutine({ name: 'Upper', weekdays: [2], items: [] }, upper.id);
  expect(await getDayTargets('2026-11-16')).toEqual({ targets: { kcal: 2400 }, kind: 'training', split: true });
  expect((await getDayTargets('2026-11-23')).kind).toBe('rest'); // no food: follows the new plan
});
