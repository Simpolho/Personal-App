import { expect, test } from 'vitest';
import type { Targets } from '../db/types';
import { remaining, targetsFor, type TargetValues } from './targets';

const rec = (effectiveFrom: string, v: TargetValues, deletedAt?: string) =>
  ({ id: effectiveFrom, createdAt: '', updatedAt: '', effectiveFrom, deletedAt, ...v }) as Targets;

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
