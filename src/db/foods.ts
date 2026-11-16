import { nowIso } from '../domain/dates';
import { NUTRIENT_KEYS, type Nutrients, type Serving } from '../domain/nutrients';
import { db } from './db';
import { isLive, softDeleted } from './records';
import type { BaseRecord, Food, FoodLike, FoodUsage } from './types';

export function isTableRef(ref: string): boolean {
  return ref.startsWith('usda:') || ref.startsWith('insa:');
}

/** Resolves a table food or a saved food. Deleted foods are returned too, so old entries can show them. */
export async function getFood(ref: string): Promise<FoodLike | undefined> {
  return isTableRef(ref) ? db.tableFoods.get(ref) : db.foods.get(ref);
}

export async function listFoods(): Promise<Food[]> {
  const all = await db.foods.toArray();
  return all.filter(isLive).sort((a, b) => a.name.localeCompare(b.name));
}

/** Keeps only known nutrient keys with real numbers: a blank stays missing, never 0 or NaN. */
export function cleanNutrients(input: Nutrients): Nutrients {
  const out: Nutrients = {};
  for (const key of NUTRIENT_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return out;
}

function cleanServings(input: Serving[]): Serving[] {
  return input
    .map((s) => ({ label: s.label.trim(), grams: s.grams }))
    .filter((s) => s.label !== '' && Number.isFinite(s.grams) && s.grams > 0);
}

export type FoodInput = Omit<Food, keyof BaseRecord | 'source'> & {
  id?: string;
  createdAt?: string;
  source?: Food['source'];
};

/** Creates a food, or updates the one with the given id (keeping its createdAt). */
export async function saveFood(input: FoodInput): Promise<Food> {
  const existing = input.id ? await db.foods.get(input.id) : undefined;
  const now = nowIso();
  const food: Food = {
    id: input.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    name: input.name.trim(),
    source: input.source ?? existing?.source ?? 'custom',
    basis: input.basis,
    nutrients: cleanNutrients(input.nutrients),
    servings: cleanServings(input.servings),
  };
  if (input.brand?.trim()) food.brand = input.brand.trim();
  if (input.barcode) food.barcode = input.barcode;
  if (input.sourceId) food.sourceId = input.sourceId;
  if (existing?.deletedAt) food.deletedAt = existing.deletedAt;
  await db.foods.put(food);
  return food;
}

/** Copies any food (usually a read-only table food) into a new editable custom food. */
export async function duplicateFood(ref: string): Promise<Food> {
  const source = await getFood(ref);
  if (!source) throw new Error('Food not found');
  return saveFood({
    name: source.name,
    brand: 'brand' in source ? source.brand : undefined,
    basis: source.basis,
    nutrients: source.nutrients,
    servings: source.servings,
  });
}

export async function deleteFood(id: string): Promise<void> {
  const food = await db.foods.get(id);
  if (food && isLive(food)) await db.foods.put(softDeleted(food));
}

async function upsertUsage(foodRef: string, change: (current: FoodUsage) => void): Promise<void> {
  const existing = await db.foodUsage.get(foodRef);
  const now = nowIso();
  const usage: FoodUsage = {
    id: foodRef,
    foodRef,
    lastAmount: existing?.lastAmount ?? 0,
    lastUnit: existing?.lastUnit ?? '',
    lastUsedAt: existing?.lastUsedAt ?? '',
    favourite: existing?.favourite ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  change(usage);
  await db.foodUsage.put(usage);
}

/** Remembers the last amount and unit used for a food or recipe. */
export async function recordUsage(foodRef: string, amount: number, unit: string): Promise<void> {
  await upsertUsage(foodRef, (u) => {
    u.lastAmount = amount;
    u.lastUnit = unit;
    u.lastUsedAt = u.updatedAt;
  });
}

export async function getUsage(foodRef: string): Promise<FoodUsage | undefined> {
  const usage = await db.foodUsage.get(foodRef);
  return usage && isLive(usage) ? usage : undefined;
}

export async function setFavourite(foodRef: string, on: boolean): Promise<void> {
  await upsertUsage(foodRef, (u) => {
    u.favourite = on;
  });
}
