import { beforeEach, expect, test } from 'vitest';
import { db, resetDb } from './db';
import { deleteFood, recordUsage, saveFood, setFavourite } from './foods';
import { newRecord } from './records';
import { favouriteItems, recentItems, recipeItems, searchAll } from './search';

beforeEach(async () => {
  await resetDb();
  await db.tableFoods.bulkPut([
    { id: 'insa:1', name: 'Arroz agulha, cru', source: 'insa', basis: '100g', nutrients: {}, servings: [], searchKey: 'arroz agulha cru' },
    { id: 'insa:2', name: 'Arroz carolino, cozido', source: 'insa', basis: '100g', nutrients: {}, servings: [], searchKey: 'arroz carolino cozido' },
  ]);
});

test('used foods first, then saved foods, then tables', async () => {
  const mine = await saveFood({ name: 'Arroz do pai', basis: '100g', nutrients: {}, servings: [] });
  await recordUsage('insa:2', 150, 'g');
  expect((await searchAll('arroz')).map((r) => [r.ref, r.group])).toEqual([['insa:2', 0], [mine.id, 1], ['insa:1', 2]]);
});
test('short queries and deleted foods return nothing', async () => {
  const f = await saveFood({ name: 'Arroz velho', basis: '100g', nutrients: {}, servings: [] });
  await deleteFood(f.id);
  expect(await searchAll('a')).toEqual([]);
  expect(await searchAll('arroz velho')).toEqual([]);
});
test('recipes are searchable', async () => {
  await db.recipes.put(newRecord({ name: 'Arroz de pato', items: [], servings: 4 }));
  expect((await searchAll('pato'))[0]).toMatchObject({ kind: 'recipe', name: 'Arroz de pato', group: 1 });
});
test('results say where a food comes from', async () => {
  await saveFood({ name: 'Arroz integral', brand: 'Marca', basis: '100g', nutrients: {}, servings: [] });
  expect((await searchAll('arroz')).map((r) => r.detail)).toEqual(['Marca', 'INSA', 'INSA']);
});
test('recent, favourite and recipe lists', async () => {
  const mine = await saveFood({ name: 'Granola', basis: '100g', nutrients: {}, servings: [] });
  await recordUsage('insa:1', 80, 'g');
  await recordUsage(mine.id, 40, 'g');
  await setFavourite('insa:2', true); // a favourite that was never logged is not "recent"
  await db.recipes.put(newRecord({ name: 'Papas', items: [], servings: 2 }));
  expect((await recentItems()).map((r) => r.name)).toEqual(['Granola', 'Arroz agulha, cru']);
  expect((await favouriteItems()).map((r) => r.name)).toEqual(['Arroz carolino, cozido']);
  expect((await recipeItems()).map((r) => [r.kind, r.name])).toEqual([['recipe', 'Papas']]);
});
