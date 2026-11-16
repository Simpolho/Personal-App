import { NUTRIENT_KEYS, type Basis, type Nutrients } from '../domain/nutrients';
import { normalize } from '../domain/search';
import type { TableFood } from '../db/types';

/**
 * Compact row of a bundled food table: values are in NUTRIENT_KEYS order, null when the source
 * has no value. Written by scripts/build-food-tables.ts, read by the app on first launch.
 */
export type TableFoodRow = [
  id: string,
  name: string,
  basis: Basis,
  values: (number | null)[],
  servings: [label: string, grams: number][],
];

export type TableFile = { version: string; source: 'usda' | 'insa'; foods: TableFoodRow[] };

/** Change this when the bundled tables change; the app then reloads them on next launch. */
export const TABLES_VERSION = '2026-11';

export const TABLE_FILES = ['food-tables/usda.json', 'food-tables/insa.json'];

export function parseTableFile(file: TableFile): TableFood[] {
  return file.foods.map(([id, name, basis, values, servings]) => {
    const nutrients: Nutrients = {};
    NUTRIENT_KEYS.forEach((key, i) => {
      const value = values[i];
      if (typeof value === 'number' && Number.isFinite(value)) nutrients[key] = value;
    });
    return {
      id,
      name,
      source: file.source,
      basis,
      nutrients,
      servings: servings.map(([label, grams]) => ({ label, grams })),
      searchKey: normalize(name),
    };
  });
}
