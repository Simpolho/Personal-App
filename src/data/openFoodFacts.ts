import type { Basis, NutrientKey, Nutrients, Serving } from '../domain/nutrients';

/** A food as read from Open Food Facts, for the user to check before anything is saved. */
export type FoodDraft = {
  name: string;
  brand?: string;
  basis: Basis;
  nutrients: Nutrients;
  servings: Serving[];
  barcode: string;
  sourceId: string;
};

export type LookupResult = { kind: 'found'; draft: FoodDraft } | { kind: 'not-found' } | { kind: 'offline' } | { kind: 'error' };

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v3/product/';
const FIELDS = 'code,product_name,product_name_pt,brands,quantity,product_quantity_unit,serving_quantity,serving_size,nutriments';

/** How the app identifies itself to Open Food Facts, as they ask. No personal details. */
export const OFF_APP_ID = 'FitnessLog/1.0 (https://simpolho.github.io/Personal-App/)';

const KEYS: [NutrientKey, string][] = [
  ['kcal', 'energy-kcal_100g'],
  ['protein', 'proteins_100g'],
  ['carbs', 'carbohydrates_100g'],
  ['fat', 'fat_100g'],
  ['fibre', 'fiber_100g'],
  ['sugars', 'sugars_100g'],
  ['saturatedFat', 'saturated-fat_100g'],
  ['salt', 'salt_100g'],
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A number ≥ 0 from a number or a numeric string; anything else is "missing". */
function amount(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function offProductToDraft(product: Record<string, unknown>, code: string): FoodDraft {
  const raw = (typeof product.nutriments === 'object' && product.nutriments !== null ? product.nutriments : {}) as Record<string, unknown>;
  const nutrients: Nutrients = {};
  for (const [key, field] of KEYS) {
    const value = amount(raw[field]);
    if (value !== undefined) nutrients[key] = round3(value);
  }
  const kj = amount(raw['energy_100g']);
  if (nutrients.kcal === undefined && kj !== undefined) nutrients.kcal = round3(kj / 4.184);
  const sodium = amount(raw['sodium_100g']);
  if (nutrients.salt === undefined && sodium !== undefined) nutrients.salt = round3(sodium * 2.5);

  const unit = text(product.product_quantity_unit).toLowerCase();
  const liquid = ['ml', 'cl', 'l'].includes(unit) || /\d\s*(ml|cl|l)\b/i.test(text(product.quantity));
  const servingGrams = amount(product.serving_quantity);
  const brand = text(product.brands).split(',')[0]?.trim();

  return {
    name: text(product.product_name_pt) || text(product.product_name),
    ...(brand ? { brand } : {}),
    basis: liquid ? '100ml' : '100g',
    nutrients,
    servings: servingGrams ? [{ label: '1 serving', grams: round3(servingGrams) }] : [],
    barcode: code,
    sourceId: text(product.code) || code,
  };
}

/** Looks a barcode up in Open Food Facts. Never throws; gives up after `timeoutMs`. */
export async function lookupOpenFoodFacts(code: string, fetchFn: typeof fetch = fetch, timeoutMs = 8000): Promise<LookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(`${PRODUCT_URL}${encodeURIComponent(code)}?fields=${FIELDS}`, {
      headers: { 'X-User-Agent': OFF_APP_ID },
      signal: controller.signal,
    });
    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'error' };
    const body = (await response.json()) as { product?: unknown };
    if (typeof body.product !== 'object' || body.product === null) return { kind: 'not-found' };
    return { kind: 'found', draft: offProductToDraft(body.product as Record<string, unknown>, code) };
  } catch (error) {
    // A network failure or our own timeout: treat as no connection.
    return error instanceof SyntaxError ? { kind: 'error' } : { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}
