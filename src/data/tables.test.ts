import { beforeEach, expect, test } from 'vitest';
import { db, resetDb } from '../db/db';
import { searchAll } from '../db/search';
import { ensureTablesLoaded, parseTableFile, type TableFile } from './tables';

beforeEach(() => resetDb());

const file: TableFile = { version: '2026-11', source: 'insa', foods: [['insa:IS001', 'Açúcar branco', '100g', [400, 0, 100, 0, 0, 100, 0, 0], []]] };
const fakeFetch = (async (url: string) =>
  url.endsWith('insa.json') ? new Response(JSON.stringify(file)) : new Response('', { status: 404 })) as typeof fetch;

test('loads once per version', async () => {
  expect(await ensureTablesLoaded(fakeFetch)).toBe('loaded');
  expect(await ensureTablesLoaded(fakeFetch)).toBe('already');
  expect(await db.tableFoods.get('insa:IS001')).toMatchObject({ searchKey: 'acucar branco', nutrients: { kcal: 400, protein: 0 } });
});
test('parseTableFile drops nulls instead of storing zeros', () =>
  expect(parseTableFile({ ...file, foods: [['usda:1', 'X', '100g', [10, null, null, null, null, null, null, null], []]] })[0].nutrients).toEqual({ kcal: 10 }));
test('parseTableFile restores servings', () =>
  expect(parseTableFile({ ...file, foods: [['usda:1', 'X', '100g', [10, null, null, null, null, null, null, null], [['1 cup', 81]]]] })[0].servings).toEqual([{ label: '1 cup', grams: 81 }]));
test('a search made before the tables arrive does not hide them afterwards', async () => {
  expect(await searchAll('acucar')).toEqual([]);
  await ensureTablesLoaded(fakeFetch);
  expect((await searchAll('acucar')).map((r) => r.ref)).toEqual(['insa:IS001']);
});
test('when no table file can be fetched, nothing is marked as loaded so the next launch tries again', async () => {
  const offline = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
  await ensureTablesLoaded(offline);
  expect(await db.meta.get('tablesVersion')).toBeUndefined();
  expect(await ensureTablesLoaded(fakeFetch)).toBe('loaded');
});
test('if one table file fails to download, what arrived is usable and the rest is fetched next launch', async () => {
  const usda: TableFile = { version: '2026-11', source: 'usda', foods: [['usda:1', 'Oats', '100g', [379, null, null, null, null, null, null, null], []]] };
  const flaky = (async (url: string) => {
    if (url.endsWith('usda.json')) throw new TypeError('network');
    return new Response(JSON.stringify(file));
  }) as typeof fetch;
  await ensureTablesLoaded(flaky);
  expect(await db.tableFoods.count()).toBe(1);
  expect(await db.meta.get('tablesVersion')).toBeUndefined();
  const working = (async (url: string) => new Response(JSON.stringify(url.endsWith('usda.json') ? usda : file))) as typeof fetch;
  expect(await ensureTablesLoaded(working)).toBe('loaded');
  expect(await db.tableFoods.count()).toBe(2);
  expect(await ensureTablesLoaded(working)).toBe('already');
});
