import Dexie, { type Table } from 'dexie';
import { cleanUpUnits } from '../domain/workouts';
import type {
  Day,
  Exercise,
  Food,
  FoodUsage,
  LogEntry,
  Meal,
  MealTemplate,
  Meta,
  Recipe,
  Routine,
  Settings,
  TableFood,
  Targets,
  WaterEntry,
  WeightEntry,
  Workout,
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
  declare exercises: Table<Exercise, string>;
  declare routines: Table<Routine, string>;
  declare workouts: Table<Workout, string>;

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
    // Step 5: workouts. One record per workout; `exerciseIds` is multi-entry to find "last time".
    this.version(3).stores({
      exercises: 'id, name',
      routines: 'id',
      workouts: 'id, date, startedAt, *exerciseIds',
    });
    // Workouts part 3: kg and lb only. Plates and bodyweight exercises move to kg, once.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const changed = cleanUpUnits(
          {
            exercises: await tx.table<Exercise, string>('exercises').toArray(),
            routines: await tx.table<Routine, string>('routines').toArray(),
            workouts: await tx.table<Workout, string>('workouts').toArray(),
          },
          new Date().toISOString(),
        );
        await tx.table('exercises').bulkPut(changed.exercises);
        await tx.table('routines').bulkPut(changed.routines);
        await tx.table('workouts').bulkPut(changed.workouts);
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
