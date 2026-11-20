import { afterEach, expect, test, vi } from 'vitest';
import nutella from './fixtures/off-nutella.json';
import { lookupOpenFoodFacts, OFF_APP_ID, offProductToDraft } from './openFoodFacts';

afterEach(() => vi.unstubAllGlobals());

const draft = (product: Record<string, unknown>) => offProductToDraft(product, '3017624010701');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('Nutella from the real response', () => {
  const d = draft(nutella.product);
  expect(d).toMatchObject({ name: 'Nutella', brand: 'Ferrero', basis: '100g', barcode: '3017624010701', sourceId: '3017624010701', servings: [] });
  expect(d.nutrients).toMatchObject({ kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugars: 56.3, saturatedFat: 10.6 });
  expect(d.nutrients.salt).toBeCloseTo(0.108, 3);
  expect(d.nutrients.fibre).toBeUndefined();
});
test('the Portuguese name wins, and only the first brand is kept', () => {
  expect(draft({ product_name: 'Plain yoghurt', product_name_pt: 'Iogurte natural', brands: 'Mimosa, Lactogal' }))
    .toMatchObject({ name: 'Iogurte natural', brand: 'Mimosa' });
});
test('drinks are per 100 ml', () => {
  for (const p of [{ product_quantity_unit: 'ml' }, { quantity: '33 cl' }, { quantity: '1,5 L' }]) expect(draft(p).basis).toBe('100ml');
  expect(draft({ quantity: '400 g' }).basis).toBe('100g');
});
test('patchy numbers: kcal from kJ, strings read as numbers, blanks stay missing', () => {
  const d = draft({ nutriments: { energy_100g: 1000, proteins_100g: '7.5', fat_100g: '' } });
  expect(d.nutrients.kcal).toBeCloseTo(239.006, 3);
  expect(d.nutrients.protein).toBe(7.5);
  expect('fat' in d.nutrients).toBe(false);
});
test('salt from sodium when salt is missing', () => {
  expect(draft({ nutriments: { sodium_100g: 0.4 } }).nutrients.salt).toBe(1);
});
test('a stated serving size becomes one serving', () => {
  expect(draft({ serving_quantity: 30, serving_size: '30 g' }).servings).toEqual([{ label: '1 serving', grams: 30 }]);
  expect(draft({ serving_quantity: '0' }).servings).toEqual([]);
});
test('a product with no name gives an empty name', () => {
  expect(draft({}).name).toBe('');
});

test('a found product, asked for with the right address and app name', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return json(nutella);
  }) as unknown as typeof fetch;
  const result = await lookupOpenFoodFacts('3017624010701', fetchFn);
  expect(result.kind).toBe('found');
  expect(calls[0].url.startsWith('https://world.openfoodfacts.org/api/v3/product/3017624010701?fields=code,product_name')).toBe(true);
  expect(new Headers(calls[0].init?.headers).get('X-User-Agent')).toBe(OFF_APP_ID);
});
test('not found, offline, rate-limited', async () => {
  const notFound = (async () => json({ status: 'failure', result: { id: 'product_not_found' } }, 404)) as unknown as typeof fetch;
  expect(await lookupOpenFoodFacts('3017624010701', notFound)).toEqual({ kind: 'not-found' });
  const offline = (async () => { throw new TypeError('Load failed'); }) as unknown as typeof fetch;
  expect(await lookupOpenFoodFacts('3017624010701', offline)).toEqual({ kind: 'offline' });
  const limited = (async () => json({}, 429)) as unknown as typeof fetch;
  expect(await lookupOpenFoodFacts('3017624010701', limited)).toEqual({ kind: 'error' });
});
test('a server that never answers gives up', async () => {
  const hangs = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
  expect(await lookupOpenFoodFacts('3017624010701', hangs, 20)).toEqual({ kind: 'offline' });
});
test('with the phone offline, nothing is fetched', async () => {
  vi.stubGlobal('navigator', { ...navigator, onLine: false });
  const fetchFn = vi.fn() as unknown as typeof fetch;
  expect(await lookupOpenFoodFacts('3017624010701', fetchFn)).toEqual({ kind: 'offline' });
  expect(fetchFn).not.toHaveBeenCalled();
});
