import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import { getFood, getUsage, listFoods, saveFood } from '../../db/foods';
import { createMeal, getDay, logFood, quickAdd } from '../../db/log';
import { saveRecipe } from '../../db/recipes';
import { setTargets } from '../../db/targets';
import type { Meal, TableFood } from '../../db/types';
import { offProductToDraft } from '../../data/openFoodFacts';
import nutella from '../../data/fixtures/off-nutella.json';
import { renderAt, user } from '../../test/render';

const oats: TableFood = { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379, protein: 13.2 }, servings: [], searchKey: 'oats' };
const banana: TableFood = { id: 'usda:173944', name: 'Banana', source: 'usda', basis: '100g', nutrients: { kcal: 89 }, servings: [{ label: '1 medium', grams: 118 }], searchKey: 'banana' };

let meal: Meal;
const entries = async () => (await getDay('2026-11-16')).meals[0].entries;

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  await db.tableFoods.bulkPut([oats, banana]);
  meal = await createMeal('2026-11-16');
});

test('search, pick, amount pre-filled from last time, add', async () => {
  await logFood(meal.id, 'usda:173904', 80, 'g');
  renderAt(`#/meal/${meal.id}/add`);
  await user.type(await screen.findByPlaceholderText('Search foods'), 'oat');
  await user.click(await screen.findByText('Oats'));
  expect(await screen.findByLabelText('Amount')).toHaveValue('80');
  expect(screen.getByText('303 kcal')).toBeInTheDocument();
  expect(screen.getByTestId('nutrient-fibre')).toHaveTextContent('–');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect(await entries()).toHaveLength(2));
  expect(await screen.findByRole('heading', { name: 'Meal 1' })).toBeInTheDocument();
});
test('comma decimals are accepted', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`);
  const input = await screen.findByLabelText('Amount');
  await user.clear(input);
  await user.type(input, '80,5');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect((await entries()).at(-1)?.amount).toBe(80.5));
});
test('"Left after this" only with targets, only for set ones', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`); // never logged before → default 100 g → 379 kcal
  expect(await screen.findByLabelText('Amount')).toHaveValue('100');
  expect(screen.queryByText(/Left after this/)).toBeNull();
  await setTargets('2026-11-01', { kcal: 2300 });
  expect(await screen.findByText('Left after this: 1921 kcal')).toBeInTheDocument();
});
test('empty amount shows an error and logs nothing', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`);
  await user.clear(await screen.findByLabelText('Amount'));
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Enter an amount')).toBeInTheDocument();
  expect(await entries()).toEqual([]);
});
test('a food with servings starts at one serving, and the unit can be changed', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173944`);
  expect(await screen.findByLabelText('Amount')).toHaveValue('1');
  expect(screen.getByLabelText('Unit')).toHaveValue('1 medium');
  expect(screen.getByText('105 kcal')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Unit'), 'g');
  expect(screen.getByText('1 kcal')).toBeInTheDocument(); // 1 g of banana
  await user.selectOptions(screen.getByLabelText('Unit'), '1 medium');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect((await entries()).at(-1)).toMatchObject({ amount: 1, unit: '1 medium' }));
});
test('recent foods are listed first; a favourite shows under Favourites', async () => {
  await logFood(meal.id, 'usda:173904', 80, 'g');
  const first = renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByText('Oats')); // from Recent
  await user.click(await screen.findByRole('button', { name: 'Add to favourites' }));
  await waitFor(async () => expect((await getUsage('usda:173904'))?.favourite).toBe(true));
  expect(await screen.findByRole('button', { name: 'Remove from favourites' })).toBeInTheDocument();
  first.unmount();
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('tab', { name: 'Favourites' }));
  expect(await screen.findByText('Oats')).toBeInTheDocument();
});
test('a recipe is logged in portions', async () => {
  await saveRecipe({ name: 'Papas', items: [{ foodRef: 'usda:173904', grams: 80 }], servings: 2 });
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('tab', { name: 'Recipes' }));
  await user.click(await screen.findByText('Papas'));
  const portions = await screen.findByLabelText('Portions');
  expect(portions).toHaveValue('1');
  expect(await screen.findByText('152 kcal')).toBeInTheDocument();
  await user.clear(portions);
  await user.type(portions, '2');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect((await entries()).at(-1)).toMatchObject({ nameSnapshot: 'Papas', amount: 2, unit: 'portion' }));
  expect((await entries()).at(-1)?.nutrientsSnapshot.kcal).toBeCloseTo(303.2);
});
test('quick add with only kcal', async () => {
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('link', { name: 'Quick add' }));
  await user.click(await screen.findByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Enter calories or a macro')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Calories (kcal)'), '650');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect(await entries()).toHaveLength(1));
  expect((await entries())[0]).toMatchObject({ nameSnapshot: 'Quick add', nutrientsSnapshot: { kcal: 650 } });
  expect((await entries())[0].nutrientsSnapshot).toEqual({ kcal: 650 }); // blanks stay missing, not 0
});
test('a quick add can be reopened and its numbers changed', async () => {
  const e = await quickAdd(meal.id, 'Lunch out', { kcal: 700 });
  renderAt(`#/meal/${meal.id}/quick?entry=${e.id}`);
  const kcal = await screen.findByLabelText('Calories (kcal)');
  expect(kcal).toHaveValue('700');
  expect(screen.getByLabelText('Name (optional)')).toHaveValue('Lunch out');
  await user.clear(kcal);
  await user.type(kcal, '650');
  await user.type(screen.getByLabelText('Protein (g)'), '30,5');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect((await entries())[0].nutrientsSnapshot).toEqual({ kcal: 650, protein: 30.5 }));
  expect(await entries()).toHaveLength(1);
});
test('new food from the add screen returns to its amount screen', async () => {
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('link', { name: 'New food' }));
  await user.type(await screen.findByLabelText('Name'), 'Granola caseira');
  await user.type(screen.getByLabelText('Calories (kcal)'), '450');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByLabelText('Amount')).toHaveValue('100');
  expect(screen.getByRole('heading', { name: 'Granola caseira' })).toBeInTheDocument();
  expect(screen.getByText('450 kcal')).toBeInTheDocument();
  expect((await listFoods()).map((f) => [f.name, f.source, f.nutrients])).toEqual([['Granola caseira', 'custom', { kcal: 450 }]]);
});
test('the food editor needs a name and calories, takes comma decimals and servings', async () => {
  renderAt(`#/foods/new?meal=${meal.id}`);
  await user.click(await screen.findByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter a name')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Name'), 'Pão de mistura');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter calories')).toBeInTheDocument();
  expect(await listFoods()).toEqual([]);
  await user.type(screen.getByLabelText('Calories (kcal)'), '250');
  await user.type(screen.getByLabelText('Protein (g)'), '8,5');
  await user.click(screen.getByRole('button', { name: 'Add serving' }));
  await user.type(screen.getByLabelText('Serving 1 name'), '1 slice');
  await user.type(screen.getByLabelText('Serving 1 amount'), '30');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByLabelText('Unit')).toHaveValue('1 slice');
  expect((await listFoods())[0]).toMatchObject({
    name: 'Pão de mistura',
    basis: '100g',
    nutrients: { kcal: 250, protein: 8.5 },
    servings: [{ label: '1 slice', grams: 30 }],
  });
});
test('table foods offer Duplicate to edit', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`);
  await user.click(await screen.findByRole('button', { name: 'Duplicate to edit' }));
  expect(await screen.findByLabelText('Name')).toHaveValue('Oats');
  expect(screen.getByLabelText('Calories (kcal)')).toHaveValue('379');
  expect(await listFoods()).toEqual([]); // nothing is created until Save
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect(await listFoods()).toHaveLength(1));
  expect((await listFoods())[0]).toMatchObject({ name: 'Oats', source: 'custom', nutrients: { kcal: 379, protein: 13.2 } });
  expect(await getFood('usda:173904')).toEqual(oats);
});
test('a saved food can be edited and deleted; past entries keep their numbers', async () => {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  await logFood(meal.id, f.id, 100, 'g');
  const first = renderAt(`#/meal/${meal.id}/add/${f.id}`);
  await user.click(await screen.findByRole('link', { name: 'Edit food' }));
  const kcal = await screen.findByLabelText('Calories (kcal)');
  await user.clear(kcal);
  await user.type(kcal, '260');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('260 kcal')).toBeInTheDocument(); // back on the amount screen
  first.unmount();
  renderAt(`#/foods/${f.id}?meal=${meal.id}`);
  await user.click(await screen.findByRole('button', { name: 'Delete food' }));
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(async () => expect(await listFoods()).toEqual([]));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect((await entries())[0]).toMatchObject({ nameSnapshot: 'Pão', nutrientsSnapshot: { kcal: 250 } });
});
test('clearing the search box goes back to the Recent list', async () => {
  await logFood(meal.id, 'usda:173904', 80, 'g');
  renderAt(`#/meal/${meal.id}/add`);
  const search = await screen.findByPlaceholderText('Search foods');
  await user.type(search, 'ban');
  expect(await screen.findByText('Banana')).toBeInTheDocument();
  await user.clear(search);
  await waitFor(() => expect(screen.queryByText('Banana')).toBeNull());
  expect(await screen.findByText('Oats')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Recent' })).toHaveAttribute('aria-selected', 'true');
});
test('if saving fails, the amount screen says so and Add works again', async () => {
  const fail = vi.spyOn(db.logEntries, 'add').mockRejectedValueOnce(new Error('disk full'));
  renderAt(`#/meal/${meal.id}/add/usda:173904`);
  await screen.findByLabelText('Amount');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  fail.mockRestore();
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(async () => expect(await entries()).toHaveLength(1));
});
test('if saving a quick add fails, it says so', async () => {
  const fail = vi.spyOn(db.logEntries, 'add').mockRejectedValueOnce(new Error('disk full'));
  renderAt(`#/meal/${meal.id}/quick`);
  await user.type(await screen.findByLabelText('Calories (kcal)'), '300');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument();
  fail.mockRestore();
});
test('a serving cannot be called g or ml, or share a name with another serving', async () => {
  renderAt(`#/foods/new?meal=${meal.id}`);
  await user.type(await screen.findByLabelText('Name'), 'Pão');
  await user.type(screen.getByLabelText('Calories (kcal)'), '250');
  await user.click(screen.getByRole('button', { name: 'Add serving' }));
  await user.type(screen.getByLabelText('Serving 1 name'), 'g');
  await user.type(screen.getByLabelText('Serving 1 amount'), '30');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('A serving cannot be called “g”')).toBeInTheDocument();
  await user.clear(screen.getByLabelText('Serving 1 name'));
  await user.type(screen.getByLabelText('Serving 1 name'), '1 fatia');
  await user.click(screen.getByRole('button', { name: 'Add serving' }));
  await user.type(screen.getByLabelText('Serving 2 name'), '1 Fatia ');
  await user.type(screen.getByLabelText('Serving 2 amount'), '40');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Two servings are called “1 Fatia”')).toBeInTheDocument();
  expect(await listFoods()).toEqual([]);
});
test('a product from Open Food Facts is checked before it is saved', async () => {
  const draft = offProductToDraft(nutella.product, '3017624010701');
  renderAt(`#/foods/new?meal=${meal.id}&barcode=3017624010701`, { draft });
  expect(await screen.findByRole('heading', { name: 'Check the label' })).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent('From Open Food Facts');
  expect(screen.getByLabelText('Name')).toHaveValue('Nutella');
  expect(screen.getByLabelText('Brand (optional)')).toHaveValue('Ferrero');
  expect(screen.getByLabelText('Calories (kcal)')).toHaveValue('539');
  expect(screen.getByLabelText('Fibre (g)')).toHaveValue('');
  expect(screen.getByText('Barcode 3017624010701')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByLabelText('Amount')).toBeInTheDocument();
  expect(await listFoods()).toEqual([
    expect.objectContaining({ name: 'Nutella', source: 'off', barcode: '3017624010701', sourceId: '3017624010701' }),
  ]);
});
test('backing out of the check saves nothing', async () => {
  const draft = offProductToDraft(nutella.product, '3017624010701');
  renderAt(`#/foods/new?meal=${meal.id}&barcode=3017624010701`, { draft });
  await user.click(await screen.findByRole('link', { name: 'Back' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect(await listFoods()).toEqual([]);
});
test('a barcode not in Open Food Facts opens New food with the barcode attached', async () => {
  renderAt(`#/foods/new?meal=${meal.id}&barcode=3017624010701&reason=not-found`);
  expect(await screen.findByRole('heading', { name: 'New food' })).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent("isn't in Open Food Facts");
  await user.type(screen.getByLabelText('Name'), 'Creme de avelã');
  await user.type(screen.getByLabelText('Calories (kcal)'), '540');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect(await listFoods()).toHaveLength(1));
  expect((await listFoods())[0]).toMatchObject({ barcode: '3017624010701', source: 'custom' });
});
test('a barcode that could not be looked up says so', async () => {
  renderAt(`#/foods/new?meal=${meal.id}&barcode=3017624010701&reason=offline`);
  expect(await screen.findByRole('note')).toHaveTextContent("couldn't be looked up");
});
