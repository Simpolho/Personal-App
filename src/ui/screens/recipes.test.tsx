import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { db, resetDb } from '../../db/db';
import { createMeal } from '../../db/log';
import { listRecipes, saveRecipe } from '../../db/recipes';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379 }, servings: [], searchKey: 'oats' },
    { id: 'usda:171265', name: 'Milk', source: 'usda', basis: '100g', nutrients: { kcal: 42 }, servings: [], searchKey: 'milk' },
  ]);
});

async function setField(label: string, value: string) {
  const field = await screen.findByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}

test('create a recipe and see kcal per portion', async () => {
  renderAt('#/recipes');
  await user.click(await screen.findByRole('link', { name: 'New recipe' }));
  await setField('Recipe name', 'Papas');
  await setField('Portions', '2');
  await user.type(screen.getByPlaceholderText('Search ingredients'), 'oat');
  await user.click(await screen.findByText('Oats'));
  await setField('Grams of Oats', '80');
  await user.type(screen.getByPlaceholderText('Search ingredients'), 'milk');
  await user.click(await screen.findByText('Milk'));
  await setField('Grams of Milk', '250');
  expect(await screen.findByText('204 kcal per portion')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect(await listRecipes()).toHaveLength(1));
  expect((await listRecipes())[0]).toMatchObject({
    name: 'Papas',
    servings: 2,
    items: [{ foodRef: 'usda:173904', grams: 80 }, { foodRef: 'usda:171265', grams: 250 }],
  });
  expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
  expect(await screen.findByText('Papas')).toBeInTheDocument();
  expect(await screen.findByText('204 kcal per portion')).toBeInTheDocument();
});
test('a recipe needs a name, portions and at least one ingredient', async () => {
  renderAt('#/recipes/new');
  await user.click(await screen.findByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Enter a name')).toBeInTheDocument();
  await setField('Recipe name', 'Papas');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Add at least one ingredient')).toBeInTheDocument();
  expect(await listRecipes()).toEqual([]);
});
test('edit a recipe, remove an ingredient, delete it', async () => {
  const r = await saveRecipe({ name: 'Papas', items: [{ foodRef: 'usda:173904', grams: 80 }, { foodRef: 'usda:171265', grams: 250 }], servings: 2 });
  const first = renderAt(`#/recipes/${r.id}`);
  expect(await screen.findByLabelText('Recipe name')).toHaveValue('Papas');
  expect(await screen.findByLabelText('Grams of Milk')).toHaveValue('250');
  await user.click(screen.getByRole('button', { name: 'Remove Milk' }));
  await setField('Portions', '1');
  expect(await screen.findByText('303 kcal per portion')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(async () => expect((await listRecipes())[0]).toMatchObject({ servings: 1, items: [{ foodRef: 'usda:173904', grams: 80 }] }));
  first.unmount();
  renderAt(`#/recipes/${r.id}`);
  await user.click(await screen.findByRole('button', { name: 'Delete recipe' }));
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(async () => expect(await listRecipes()).toEqual([]));
});
test('the Recipes tab on Add food links to the recipe list', async () => {
  const meal = await createMeal('2026-11-16');
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('tab', { name: 'Recipes' }));
  await user.click(await screen.findByRole('link', { name: 'Manage recipes' }));
  expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
});
