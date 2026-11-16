// @vitest-environment node
import { mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { convertUsda } from './usda';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

test('convertUsda keeps generic foods and maps nutrients', () => {
  const t = convertUsda(fixture('usda'));
  expect(t.source).toBe('usda');
  expect(t.foods).toHaveLength(1);
  const [id, name, basis, values, servings] = t.foods[0];
  expect([id, name, basis]).toEqual(['usda:100', 'Oats', '100g']);
  expect(values[0]).toBe(379);
  expect(values[1]).toBe(13.2);
  expect(values[2]).toBeNull();
  expect(values[7]).toBeCloseTo(0.015);
  expect(servings).toEqual([['1 cup', 81]]);
});
test('Foundation Foods: energy and carbs fall back, measure units name the serving, foods with no energy are left out', () => {
  const t = convertUsda(fixture('usda-foundation'));
  expect(t.foods).toHaveLength(1);
  const [id, , , values, servings] = t.foods[0];
  expect(id).toBe('usda:300');
  expect(values[0]).toBe(120); // 2047 before 2048 when 1008 is missing
  expect(values[2]).toBe(20.123); // carbohydrate by summation, rounded to 3 decimals
  expect(values[5]).toBe(1.5); // 1063 when 2000 is missing
  expect(servings).toEqual([['2 tablespoon', 35.8]]);
});
test('convertUsda refuses to run when a nutrient id no longer means what the mapping assumes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usda-'));
  cpSync(fixture('usda'), dir, { recursive: true });
  writeFileSync(join(dir, 'nutrient.csv'), '"id","name","unit_name","nutrient_nbr","rank"\n"1008","Protein","G","203","600.0"\n');
  expect(() => convertUsda(dir)).toThrow(/1008/);
});
