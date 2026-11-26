import { expect, test } from 'vitest';
import type { Routine, Targets } from '../db/types';
import { dayKindFor, hasRestSet, remaining, targetSetsFor, targetsFor, type TargetValues } from './targets';

const rec = (effectiveFrom: string, v: TargetValues, deletedAt?: string, rest?: TargetValues) =>
  ({ id: effectiveFrom, createdAt: '', updatedAt: '', effectiveFrom, deletedAt, ...v, ...(rest ? { rest } : {}) }) as Targets;

test('no records means no targets', () => expect(targetsFor('2026-11-16', [])).toBeNull());
test('the latest record on or before the date wins, as a whole set', () => {
  const list = [rec('2026-11-01', { kcal: 2300, protein: 160 }), rec('2026-11-10', { kcal: 2100 })];
  expect(targetsFor('2026-10-31', list)).toBeNull();
  expect(targetsFor('2026-11-05', list)).toEqual({ kcal: 2300, protein: 160 });
  expect(targetsFor('2026-11-10', list)).toEqual({ kcal: 2100 });
});
test('a record with no values switches targets off', () =>
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }), rec('2026-11-15', {})])).toBeNull());
test('deleted records are ignored', () =>
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }), rec('2026-11-15', { kcal: 1 }, 'x')])).toEqual({ kcal: 2300 }));
test('remaining covers only set targets and never NaN', () => {
  expect(remaining({ kcal: 2100 }, { kcal: 1640, protein: 120 })).toEqual({ kcal: 460 });
  expect(remaining({ kcal: 2000, protein: 150 }, {})).toEqual({ kcal: 2000, protein: 150 });
  expect(remaining({ kcal: 2000 }, { kcal: 2100 })).toEqual({ kcal: -100 });
  expect(remaining({}, { kcal: 500 })).toEqual({});
});
test('the rest set applies on a rest day, the main set otherwise', () => {
  const list = [rec('2026-11-01', { kcal: 2400, carbs: 280 }, undefined, { kcal: 2000, carbs: 180 })];
  expect(targetsFor('2026-11-16', list, 'rest')).toEqual({ kcal: 2000, carbs: 180 });
  expect(targetsFor('2026-11-16', list, 'training')).toEqual({ kcal: 2400, carbs: 280 });
  expect(targetsFor('2026-11-16', list)).toEqual({ kcal: 2400, carbs: 280 });
});
test('with no rest values every day uses the main set', () => {
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 })], 'rest')).toEqual({ kcal: 2300 });
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }, undefined, {})], 'rest')).toEqual({ kcal: 2300 });
});
test('a rest set alone gives no targets on training days', () => {
  const list = [rec('2026-11-01', {}, undefined, { kcal: 2000 })];
  expect(targetsFor('2026-11-16', list, 'training')).toBeNull();
  expect(targetsFor('2026-11-16', list, 'rest')).toEqual({ kcal: 2000 });
});
test('targetSetsFor gives both cleaned sets of the record in force', () => {
  const list = [rec('2026-11-01', { kcal: 2400 }, undefined, { kcal: -5, protein: 150 })];
  expect(targetSetsFor('2026-10-31', list)).toBeNull();
  expect(targetSetsFor('2026-11-16', list)).toEqual({ main: { kcal: 2400 }, rest: { protein: 150 } });
});
test('hasRestSet is true only when the rest set has a value', () => {
  expect(hasRestSet(null)).toBe(false);
  expect(hasRestSet({ main: { kcal: 2400 }, rest: {} })).toBe(false);
  expect(hasRestSet({ main: {}, rest: { kcal: 2000 } })).toBe(true);
});
test('dayKindFor: a saved choice wins, otherwise the weekly plan', () => {
  const monday = [{ weekdays: [1] }] as Routine[];
  expect(dayKindFor(undefined, monday, '2026-11-16')).toBe('training');
  expect(dayKindFor(undefined, monday, '2026-11-17')).toBe('rest');
  expect(dayKindFor('rest', monday, '2026-11-16')).toBe('rest');
  expect(dayKindFor('training', [], '2026-11-17')).toBe('training');
});
