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

export type DayKind = 'training' | 'rest';

/** `id === date`. */
export interface Day extends BaseRecord {
  date: string;
  complete: boolean;
  /** Training or rest day, once the user has chosen. Absent: the weekly plan decides. */
  kind?: DayKind;
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
  /** The fields above are the Training day set (or the only set, when `rest` has no values). */
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  /** The Rest day set. Absent or empty: every day uses the set above. */
  rest?: Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>;
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
  waterTargetMl?: number;
  waterSmallMl?: number;
  waterLargeMl?: number;
}

export interface Meta {
  key: string;
  value: string;
}

/** Step 5: workouts. The fixed list of muscle groups, in display order. */
export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Forearms'
  | 'Quads'
  | 'Hamstrings'
  | 'Glutes'
  | 'Calves'
  | 'Abs';

/** What an exercise's weight is measured in. For a bodyweight exercise, the weight typed is the weight held (0 for none). */
export type ExerciseUnit = 'kg' | 'lb';
/** The unit a workout entry was logged in. `plates` only appears on entries logged before plates were dropped. */
export type EntryUnit = ExerciseUnit | 'plates';

export interface Exercise extends BaseRecord {
  name: string;
  muscle: MuscleGroup;
  unit: ExerciseUnit;
  /** What one plate weighs, from when plates were a unit. Old plate sets count toward volume only with it. */
  plateWeight?: { value: number; unit: 'kg' | 'lb' };
  /** Weight and reps are for one side; volume counts both. */
  eachSide: boolean;
  /** Shown every time the exercise comes up. */
  note: string;
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** As written in the plan, e.g. "7–8" or "≤8"; may be empty. */
  rpeTarget: string;
  /** Used to pre-fill until the exercise has been done once. */
  startWeight?: number;
}

export interface Routine extends BaseRecord {
  name: string;
  /** Days it's planned for, 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  items: RoutineItem[];
}

export interface WorkoutSet {
  id: string;
  warmup: boolean;
  weight?: number;
  reps?: number;
  rpe?: number;
  done: boolean;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  /** The unit the sets were logged in, kept even if the exercise's unit changes later. */
  unit: EntryUnit;
  target?: Omit<RoutineItem, 'exerciseId' | 'startWeight'>;
  sets: WorkoutSet[];
}

/** One record per workout, holding its exercises and sets. In progress until `finishedAt` is set. */
export interface Workout extends BaseRecord {
  /** Local YYYY-MM-DD the workout belongs to (its start). */
  date: string;
  name: string;
  routineId?: string;
  startedAt: string;
  finishedAt?: string;
  entries: WorkoutEntry[];
  /** The entries' exercise ids, indexed to find "last time" quickly. */
  exerciseIds: string[];
}
