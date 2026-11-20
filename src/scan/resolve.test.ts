import { beforeEach, expect, test, vi } from 'vitest';
import nutella from '../data/fixtures/off-nutella.json';
import { resetDb } from '../db/db';
import { saveFood } from '../db/foods';
import { resolveBarcode } from './resolve';

beforeEach(() => resetDb());

test('a saved food is found on the phone without asking Open Food Facts', async () => {
  const food = await saveFood({ name: 'Nutella', barcode: '3017624010701', basis: '100g', nutrients: { kcal: 539 }, servings: [] });
  const fetchFn = vi.fn() as unknown as typeof fetch;
  expect(await resolveBarcode('3017624010701', fetchFn)).toEqual({ kind: 'saved', food });
  expect(fetchFn).not.toHaveBeenCalled();
});
test('an unknown barcode is looked up', async () => {
  const fetchFn = (async () => new Response(JSON.stringify(nutella))) as unknown as typeof fetch;
  expect((await resolveBarcode('3017624010701', fetchFn)).kind).toBe('found');
});
