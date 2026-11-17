import { expect, test } from 'vitest';
import {
  amountInBase,
  formatNutrient,
  parseAmount,
  scaleNutrients,
  scaleSnapshot,
  sumNutrients,
  type NutrientKey,
  type Nutrients,
} from './nutrients';

const close = (a: Nutrients, e: Nutrients) => {
  expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
  for (const k of Object.keys(e) as NutrientKey[]) expect(a[k]).toBeCloseTo(e[k]!, 6);
};

test('scaleNutrients scales per-100 values to the amount', () =>
  close(scaleNutrients({ kcal: 379, protein: 13.2, fat: 6.5 }, 80), { kcal: 303.2, protein: 10.56, fat: 5.2 }));
test('scaleNutrients keeps missing nutrients missing', () =>
  expect(scaleNutrients({ kcal: 100 }, 50)).toEqual({ kcal: 50 }));
test('scaleSnapshot multiplies every value', () =>
  close(scaleSnapshot({ kcal: 303.2, protein: 10.56 }, 0.5), { kcal: 151.6, protein: 5.28 }));
test('sumNutrients adds only known values', () => {
  expect(sumNutrients([{ kcal: 100, fibre: 2 }, { kcal: 50 }])).toEqual({ kcal: 150, fibre: 2 });
  expect(sumNutrients([])).toEqual({});
  expect(Number.isNaN(sumNutrients([{ kcal: 1 }, { salt: undefined }]).kcal)).toBe(false);
});
test('formatNutrient rounds per nutrient', () => {
  expect(formatNutrient('kcal', 311.2)).toBe('311');
  expect(formatNutrient('protein', 13.52)).toBe('13.5');
  expect(formatNutrient('salt', 0.254)).toBe('0.25');
  expect(formatNutrient('fibre', undefined)).toBe('–');
});
test('parseAmount accepts dot and comma decimals', () => {
  expect(parseAmount('80')).toBe(80);
  expect(parseAmount('80,5')).toBe(80.5);
  expect(parseAmount(' 80.5 ')).toBe(80.5);
  for (const bad of ['', 'abc', '-5', '0', '1,2,3']) expect(parseAmount(bad)).toBeNull();
  expect(parseAmount('0', { allowZero: true })).toBe(0);
});
test('amountInBase converts servings to grams', () => {
  const servings = [{ label: '1 medium', grams: 118 }];
  expect(amountInBase(80, 'g', '100g', servings)).toBe(80);
  expect(amountInBase(250, 'ml', '100ml', [])).toBe(250);
  expect(amountInBase(1.5, '1 medium', '100g', servings)).toBe(177);
  expect(() => amountInBase(1, 'slice', '100g', servings)).toThrow();
});
test('parseAmount accepts a leading decimal point or comma', () => {
  expect(parseAmount(',5')).toBe(0.5);
  expect(parseAmount('.5')).toBe(0.5);
  for (const bad of [',', '.', '5,', '5.']) expect(parseAmount(bad)).toBeNull();
});
