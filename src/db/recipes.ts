import { nowIso } from '../domain/dates';
import { scaleNutrients, scaleSnapshot, sumNutrients, type Nutrients } from '../domain/nutrients';
import { db } from './db';
import { getFood, recordUsage } from './foods';
import { isLive, newRecord, softDeleted } from './records';
import type { LogEntry, Recipe } from './types';

export interface RecipeInput {
  id?: string;
  name: string;
  items: { foodRef: string; grams: number }[];
  /** How many portions the recipe makes. */
  servings: number;
}

export async function saveRecipe(input: RecipeInput): Promise<Recipe> {
  const existing = input.id ? await db.recipes.get(input.id) : undefined;
  const now = nowIso();
  const recipe: Recipe = {
    id: input.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    name: input.name.trim(),
    items: input.items.map((i) => ({ foodRef: i.foodRef, grams: i.grams })),
    servings: input.servings,
  };
  if (existing?.deletedAt) recipe.deletedAt = existing.deletedAt;
  await db.recipes.put(recipe);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const recipe = await db.recipes.get(id);
  if (recipe && isLive(recipe)) await db.recipes.put(softDeleted(recipe));
}

export async function listRecipes(): Promise<Recipe[]> {
  return (await db.recipes.toArray()).filter(isLive).sort((a, b) => a.name.localeCompare(b.name));
}

/** Nutrients of one portion: the ingredients' totals divided by the number of portions. */
export async function recipeNutrientsPerPortion(recipe: Pick<Recipe, 'items' | 'servings'>): Promise<Nutrients> {
  const parts: Nutrients[] = [];
  for (const item of recipe.items) {
    const food = await getFood(item.foodRef);
    if (food) parts.push(scaleNutrients(food.nutrients, item.grams));
  }
  return scaleSnapshot(sumNutrients(parts), 1 / recipe.servings);
}

/** Logs portions of a recipe. Like any entry, it keeps its own copy of the totals. */
export async function logRecipe(mealId: string, recipeRef: string, portions: number): Promise<LogEntry> {
  const recipe = await db.recipes.get(recipeRef);
  if (!recipe) throw new Error('Recipe not found');
  const perPortion = await recipeNutrientsPerPortion(recipe);
  const entry: LogEntry = newRecord({
    mealId,
    foodRef: undefined,
    recipeRef,
    nameSnapshot: recipe.name,
    amount: portions,
    unit: 'portion',
    nutrientsSnapshot: scaleSnapshot(perPortion, portions),
  });
  await db.logEntries.add(entry);
  await recordUsage(recipeRef, portions, 'portion');
  return entry;
}
