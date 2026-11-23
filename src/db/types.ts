import type { Basis, Nutrients, Serving } from '../domain/nutrients';

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Bundled USDA / INSA food. Read-only; ids look like `usda:171287` or `insa:IS001`. */
export interface TableFood {
  id: string;
  name: string;
  source: 'usda' | 'insa';
  basis: Basis;
  nutrients: Nutrients;
  servings: Serving[];
  /** Name lower-cased with accents and punctuation removed, for search. */
  searchKey: string;
}

/** A food the user made, edited a copy of, or (from step 2) looked up by barcode. */
export interface Food extends BaseRecord {
  name: string;
  brand?: string;
  barcode?: string;
  source: 'custom' | 'off';
  sourceId?: string;
  basis: Basis;
  nutrients: Nutrients;
  servings: Serving[];
}

export type FoodLike = TableFood | Food;

/** One per food or recipe ref (`id === foodRef`), so read-only table foods remember amounts too. */
export interface FoodUsage extends BaseRecord {
  foodRef: string;
  /** 0 means "never logged" (a favourite that has not been used yet). */
  lastAmount: number;
  lastUnit: string;
  /** Empty when never logged. */
  lastUsedAt: string;
  favourite: boolean;
}

export interface Recipe extends BaseRecord {
  name: string;
  items: { foodRef: string; grams: number }[];
  /** How many portions the recipe makes. */
  servings: number;
}

export interface Meal extends BaseRecord {
  /** Local YYYY-MM-DD. */
  date: string;
  name: string;
  /** Local HH:MM. */
  time: string;
}

export type TemplateItem =
  | { kind: 'food'; foodRef: string; amount: number; unit: string }
  | { kind: 'recipe'; recipeRef: string; amount: number }
  | { kind: 'quick'; name: string; nutrients: Nutrients };

export interface MealTemplate extends BaseRecord {
  name: string;
  items: TemplateItem[];
}

/** `id === date`. */
export interface Day extends BaseRecord {
  date: string;
  complete: boolean;
}

export interface LogEntry extends BaseRecord {
  mealId: string;
  /** Both refs are empty for a quick add. */
  foodRef?: string;
  recipeRef?: string;
  nameSnapshot: string;
  amount: number;
  /** 'g', 'ml', a serving label, 'portion' (recipes) or 'quick'. */
  unit: string;
  /** Totals for this entry, fixed when it is logged. Never recomputed from the food. */
  nutrientsSnapshot: Nutrients;
}

export interface Targets extends BaseRecord {
  /** Local YYYY-MM-DD from which these targets apply. */
  effectiveFrom: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/** One per day: `id === date`. */
export interface WeightEntry extends BaseRecord {
  /** Local YYYY-MM-DD. */
  date: string;
  kg: number;
}

/** One per tap of a water button, so Undo can remove the last one. */
export interface WaterEntry extends BaseRecord {
  /** Local YYYY-MM-DD. */
  date: string;
  ml: number;
}

/** `id === 'settings'`. */
export interface Settings extends BaseRecord {
  lastExportAt?: string;
}

export interface Meta {
  key: string;
  value: string;
}
