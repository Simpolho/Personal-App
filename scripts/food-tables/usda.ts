import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { TABLES_VERSION, type TableFile, type TableFoodRow } from '../../src/data/tableFormat';
import { NUTRIENT_KEYS, type NutrientKey } from '../../src/domain/nutrients';

/** FoodData Central nutrient ids, in order of preference, for each of the app's nutrients. */
const SOURCES: Record<Exclude<NutrientKey, 'salt'>, number[]> = {
  kcal: [1008, 2047, 2048], // Energy; Atwater general; Atwater specific (Foundation Foods)
  protein: [1003],
  carbs: [1005, 1050], // by difference; by summation
  fat: [1004],
  fibre: [1079],
  sugars: [2000, 1063],
  saturatedFat: [1258],
};
const SODIUM_MG = 1093; // salt (g) = sodium (mg) × 2.5 / 1000

/** What each id must be in nutrient.csv for the mapping above to be right. */
const EXPECTED: Record<number, { name: RegExp; unit: string }> = {
  1008: { name: /^energy$/i, unit: 'KCAL' },
  2047: { name: /^energy \(atwater general/i, unit: 'KCAL' },
  2048: { name: /^energy \(atwater specific/i, unit: 'KCAL' },
  1003: { name: /^protein$/i, unit: 'G' },
  1005: { name: /^carbohydrate, by difference/i, unit: 'G' },
  1050: { name: /^carbohydrate, by summation/i, unit: 'G' },
  1004: { name: /^total lipid/i, unit: 'G' },
  1079: { name: /^fiber, total dietary/i, unit: 'G' },
  2000: { name: /sugars/i, unit: 'G' },
  1063: { name: /sugars/i, unit: 'G' },
  1258: { name: /^fatty acids, total saturated/i, unit: 'G' },
  1093: { name: /^sodium/i, unit: 'MG' },
};

const KEEP_TYPES = new Set(['foundation_food', 'sr_legacy_food']);

type Row = Record<string, string>;

function readCsv<T>(file: string, pick: (row: Row) => T | null): T[] {
  return parse(readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    on_record: (row: Row) => pick(row),
  }) as T[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function verifyNutrientIds(dir: string): void {
  const file = join(dir, 'nutrient.csv');
  if (!existsSync(file)) return;
  for (const row of readCsv(file, (r) => r)) {
    const expected = EXPECTED[Number(row.id)];
    if (expected && (!expected.name.test(row.name) || row.unit_name.toUpperCase() !== expected.unit)) {
      throw new Error(`USDA nutrient ${row.id} is "${row.name}" [${row.unit_name}], not what the mapping expects`);
    }
  }
}

/**
 * Converts one unzipped FoodData Central CSV download (SR Legacy or Foundation Foods) to the
 * app's compact table. Keeps generic foods only; foods with no energy value are left out.
 */
export function convertUsda(dir: string): TableFile {
  verifyNutrientIds(dir);

  const names = new Map<string, string>();
  readCsv(join(dir, 'food.csv'), (r) => {
    if (KEEP_TYPES.has(r.data_type)) names.set(r.fdc_id, r.description.trim());
    return null;
  });

  const wanted = new Set<number>([...Object.values(SOURCES).flat(), SODIUM_MG]);
  const amounts = new Map<string, Map<number, number>>();
  readCsv(join(dir, 'food_nutrient.csv'), (r) => {
    const nutrientId = Number(r.nutrient_id);
    if (!names.has(r.fdc_id) || !wanted.has(nutrientId) || r.amount === '') return null;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) return null;
    let perFood = amounts.get(r.fdc_id);
    if (!perFood) amounts.set(r.fdc_id, (perFood = new Map()));
    perFood.set(nutrientId, amount);
    return null;
  });

  const units = new Map<string, string>();
  const unitsFile = join(dir, 'measure_unit.csv');
  if (existsSync(unitsFile)) readCsv(unitsFile, (r) => (units.set(r.id, r.name.trim()), null));

  const servings = new Map<string, [string, number][]>();
  const portionsFile = join(dir, 'food_portion.csv');
  if (existsSync(portionsFile)) {
    readCsv(portionsFile, (r) => {
      const grams = Number(r.gram_weight);
      if (!names.has(r.fdc_id) || r.gram_weight === '' || !Number.isFinite(grams) || grams <= 0) return null;
      const unitName = units.get(r.measure_unit_id);
      const what = r.modifier.trim() || (unitName && unitName !== 'undetermined' ? unitName : '') || r.portion_description.trim();
      const amount = r.amount === '' ? '' : String(Number(r.amount));
      const label = `${amount} ${what}`.trim();
      if (!what || !label) return null;
      let list = servings.get(r.fdc_id);
      if (!list) servings.set(r.fdc_id, (list = []));
      if (!list.some(([existing]) => existing === label)) list.push([label, round3(grams)]);
      return null;
    });
  }

  const foods: TableFoodRow[] = [];
  for (const [fdcId, name] of names) {
    const perFood = amounts.get(fdcId) ?? new Map<number, number>();
    const values = NUTRIENT_KEYS.map((key) => {
      if (key === 'salt') {
        const sodium = perFood.get(SODIUM_MG);
        return sodium === undefined ? null : round3((sodium * 2.5) / 1000);
      }
      for (const id of SOURCES[key]) {
        const amount = perFood.get(id);
        if (amount !== undefined) return round3(amount);
      }
      return null;
    });
    if (values[0] === null) continue; // no energy value: no use in a food log
    foods.push([`usda:${fdcId}`, name, '100g', values, servings.get(fdcId) ?? []]);
  }
  return { version: TABLES_VERSION, source: 'usda', foods };
}
