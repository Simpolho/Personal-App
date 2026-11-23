import Dexie, { type Table } from 'dexie';
import type {
  Day,
  Food,
  FoodUsage,
  LogEntry,
  Meal,
  MealTemplate,
  Meta,
  Recipe,
  Settings,
  TableFood,
  Targets,
  WaterEntry,
  WeightEntry,
} from './types';

export class AppDB extends Dexie {
  declare tableFoods: Table<TableFood, string>;
  declare foods: Table<Food, string>;
  declare foodUsage: Table<FoodUsage, string>;
  declare recipes: Table<Recipe, string>;
  declare meals: Table<Meal, string>;
  declare mealTemplates: Table<MealTemplate, string>;
  declare days: Table<Day, string>;
  declare logEntries: Table<LogEntry, string>;
  declare targets: Table<Targets, string>;
  declare settings: Table<Settings, string>;
  declare meta: Table<Meta, string>;
  declare weights: Table<WeightEntry, string>;
  declare water: Table<WaterEntry, string>;

  constructor() {
    super('fitness-app');
    this.version(1).stores({
      tableFoods: 'id',
      foods: 'id, barcode',
      foodUsage: 'id, lastUsedAt',
      recipes: 'id',
      meals: 'id, date',
      mealTemplates: 'id',
      days: 'id',
      logEntries: 'id, mealId',
      targets: 'id, effectiveFrom',
      settings: 'id',
      meta: 'key',
    });
    // Step 3: weight (one per day, keyed by date) and water (one record per tap).
    this.version(2).stores({
      weights: 'id, date',
      water: 'id, date',
    });
  }
}

export const db = new AppDB();

let tablesGen = 0;

/** Changes whenever the bundled food tables are (re)loaded, so in-memory copies know to refresh. */
export function tablesGeneration(): number {
  return tablesGen;
}

export function bumpTablesGeneration(): void {
  tablesGen += 1;
}

/** Tests only: delete the database and open it again, empty. */
export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
  bumpTablesGeneration();
}
