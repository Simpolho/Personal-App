import { matchesKey, normalize, queryWords } from '../domain/search';
import { db, tablesGeneration } from './db';
import { isLive } from './records';
import type { Food, FoodUsage, Recipe, TableFood } from './types';

/**
 * group 0: foods and recipes used before or marked favourite; 1: saved foods and recipes;
 * 2: bundled table foods. `detail` is the brand, or 'USDA' / 'INSA' for table foods.
 */
export type SearchResult = {
  kind: 'food' | 'recipe';
  ref: string;
  name: string;
  detail?: string;
  group: 0 | 1 | 2;
};

let tableCache: { generation: number; foods: Map<string, TableFood> } | null = null;

/** The bundled tables, read from IndexedDB once and kept in memory until they are reloaded. */
async function tableFoods(): Promise<Map<string, TableFood>> {
  const generation = tablesGeneration();
  if (!tableCache || tableCache.generation !== generation) {
    const foods = await db.tableFoods.toArray();
    tableCache = { generation, foods: new Map(foods.map((f) => [f.id, f])) };
  }
  return tableCache.foods;
}

interface Sources {
  tables: Map<string, TableFood>;
  foods: Map<string, Food>;
  recipes: Map<string, Recipe>;
  usage: FoodUsage[];
}

async function loadSources(): Promise<Sources> {
  const [tables, foods, recipes, usage] = await Promise.all([
    tableFoods(),
    db.foods.toArray(),
    db.recipes.toArray(),
    db.foodUsage.toArray(),
  ]);
  return {
    tables,
    foods: new Map(foods.filter(isLive).map((f) => [f.id, f])),
    recipes: new Map(recipes.filter(isLive).map((r) => [r.id, r])),
    usage: usage.filter(isLive),
  };
}

const fromTable = (f: TableFood, group: 0 | 2): SearchResult => ({
  kind: 'food',
  ref: f.id,
  name: f.name,
  detail: f.source === 'usda' ? 'USDA' : 'INSA',
  group,
});
const fromFood = (f: Food, group: 0 | 1): SearchResult => ({ kind: 'food', ref: f.id, name: f.name, detail: f.brand, group });
const fromRecipe = (r: Recipe, group: 0 | 1): SearchResult => ({ kind: 'recipe', ref: r.id, name: r.name, group });

/** Turns a usage record into a result, or undefined when its food or recipe is gone. */
function resolveUsed(ref: string, s: Sources): SearchResult | undefined {
  const table = s.tables.get(ref);
  if (table) return fromTable(table, 0);
  const food = s.foods.get(ref);
  if (food) return fromFood(food, 0);
  const recipe = s.recipes.get(ref);
  if (recipe) return fromRecipe(recipe, 0);
  return undefined;
}

const wasLogged = (u: FoodUsage) => u.lastAmount > 0 && u.lastUsedAt !== '';
const newestFirst = (a: FoodUsage, b: FoodUsage) => b.lastUsedAt.localeCompare(a.lastUsedAt);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Searches everything, ignoring case and accents and matching word starts. Order: used and
 * favourite items (most recent first), then saved foods and recipes (by name), then table
 * foods (shorter names first).
 */
export async function searchAll(query: string, limit = 50): Promise<SearchResult[]> {
  if (normalize(query).length < 2) return [];
  const words = queryWords(query);
  const s = await loadSources();
  const hit = (name: string) => matchesKey(words, normalize(name));

  const used: SearchResult[] = [];
  const usedRefs = new Set<string>();
  for (const u of s.usage.filter((u) => u.favourite || wasLogged(u)).sort(newestFirst)) {
    const result = resolveUsed(u.foodRef, s);
    if (!result) continue;
    const table = s.tables.get(u.foodRef);
    if (!(table ? matchesKey(words, table.searchKey) : hit(result.name))) continue;
    used.push(result);
    usedRefs.add(u.foodRef);
  }

  const saved: SearchResult[] = [];
  for (const f of s.foods.values()) if (!usedRefs.has(f.id) && hit(f.name)) saved.push(fromFood(f, 1));
  for (const r of s.recipes.values()) if (!usedRefs.has(r.id) && hit(r.name)) saved.push(fromRecipe(r, 1));
  saved.sort(byName);

  const tables: SearchResult[] = [];
  if (used.length + saved.length < limit) {
    for (const f of s.tables.values()) {
      if (!usedRefs.has(f.id) && matchesKey(words, f.searchKey)) tables.push(fromTable(f, 2));
    }
    tables.sort((a, b) => a.name.length - b.name.length || byName(a, b));
  }

  return [...used, ...saved, ...tables].slice(0, limit);
}

/** Foods and recipes logged before, most recent first. */
export async function recentItems(limit = 20): Promise<SearchResult[]> {
  const s = await loadSources();
  const out: SearchResult[] = [];
  for (const u of s.usage.filter(wasLogged).sort(newestFirst)) {
    const result = resolveUsed(u.foodRef, s);
    if (result) out.push(result);
    if (out.length >= limit) break;
  }
  return out;
}

export async function favouriteItems(): Promise<SearchResult[]> {
  const s = await loadSources();
  const out: SearchResult[] = [];
  for (const u of s.usage.filter((u) => u.favourite)) {
    const result = resolveUsed(u.foodRef, s);
    if (result) out.push(result);
  }
  return out.sort(byName);
}

export async function recipeItems(): Promise<SearchResult[]> {
  const recipes = (await db.recipes.toArray()).filter(isLive);
  return recipes.map((r) => fromRecipe(r, 1)).sort(byName);
}
