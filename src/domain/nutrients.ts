export const NUTRIENT_KEYS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fibre',
  'sugars',
  'saturatedFat',
  'salt',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Grams, except kcal. A missing value is absent from the map: never 0, never NaN. */
export type Nutrients = Partial<Record<NutrientKey, number>>;

export type Basis = '100g' | '100ml';

export interface Serving {
  label: string;
  grams: number;
}

const isKnown = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function mapKnown(source: Nutrients, fn: (value: number) => number): Nutrients {
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const value = source[key];
    if (isKnown(value)) out[key] = fn(value);
  }
  return out;
}

/** Per-100 values scaled to an amount in the food's base unit (g or ml). */
export function scaleNutrients(per100: Nutrients, amount: number): Nutrients {
  return mapKnown(per100, (v) => (v * amount) / 100);
}

/** Multiplies an entry's stored totals, e.g. when its amount is edited. */
export function scaleSnapshot(snapshot: Nutrients, factor: number): Nutrients {
  return mapKnown(snapshot, (v) => v * factor);
}

/** Adds only known values; a nutrient nobody reports stays missing. */
export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = {};
  for (const item of list) {
    for (const key of NUTRIENT_KEYS) {
      const value = item[key];
      if (isKnown(value)) out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

const DECIMALS: Partial<Record<NutrientKey, number>> = { kcal: 0, salt: 2 };

export function formatNutrient(key: NutrientKey, value: number | undefined): string {
  if (!isKnown(value)) return '–';
  return value.toFixed(DECIMALS[key] ?? 1);
}

/** Parses a typed number, accepting a decimal comma ("80,5"). Returns null when invalid. */
export function parseAmount(input: string, opts?: { allowZero?: boolean }): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  if (value === 0 && !opts?.allowZero) return null;
  return value;
}

/** Converts an amount in `unit` ('g', 'ml' or a serving label) to the food's base unit. */
export function amountInBase(amount: number, unit: string, basis: Basis, servings: Serving[]): number {
  const baseUnit = basis === '100g' ? 'g' : 'ml';
  if (unit === baseUnit) return amount;
  const serving = servings.find((s) => s.label === unit);
  if (!serving) throw new Error(`Unknown unit "${unit}" for this food`);
  return amount * serving.grams;
}
