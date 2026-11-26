import { nowIso } from '../domain/dates';
import { MUSCLE_GROUPS, WEIGHT_UNITS } from '../domain/workouts';
import { db } from './db';
import type { BaseRecord, Settings } from './types';

export const EXPORT_FORMAT = 'fitness-app-export';
export const EXPORT_VERSION = 1;

/** Everything the user made. The bundled food tables and `meta` are never exported. */
export const RECORD_TABLES = [
  'foods',
  'foodUsage',
  'recipes',
  'meals',
  'mealTemplates',
  'days',
  'logEntries',
  'targets',
  'settings',
  'weights',
  'water',
  'exercises',
  'routines',
  'workouts',
] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

export type ExportFile = {
  format: string;
  version: number;
  exportedAt: string;
  records: Record<RecordTable, BaseRecord[]>;
};

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Sets (or, with undefined, clears) the time of the last export. */
export async function setLastExportAt(value: string | undefined): Promise<void> {
  const existing = await db.settings.get('settings');
  const now = nowIso();
  // Keep everything else in the settings record (e.g. water settings).
  const { lastExportAt: _previous, ...rest } = existing ?? {};
  const settings: Settings = { ...rest, id: 'settings', createdAt: existing?.createdAt ?? now, updatedAt: now };
  if (value) settings.lastExportAt = value;
  await db.settings.put(settings);
}

/** Builds the backup file. Deleted records are included so deletions carry over too. */
export async function exportAll(): Promise<ExportFile> {
  const exportedAt = nowIso();
  await setLastExportAt(exportedAt);
  const records = {} as Record<RecordTable, BaseRecord[]>;
  for (const table of RECORD_TABLES) records[table] = await db.table<BaseRecord, string>(table).toArray();
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, records };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNutrients = (v: unknown) => isObject(v) && Object.values(v).every((x) => x === undefined || isNumber(x));
const isListOf = (v: unknown, check: (item: Record<string, unknown>) => boolean) =>
  Array.isArray(v) && v.every((item) => isObject(item) && check(item));

const isTargetSet = (r: Record<string, unknown>) => ['kcal', 'protein', 'carbs', 'fat'].every((k) => r[k] === undefined || isNumber(r[k]));

/** What each kind of record must contain for the screens to be able to show it. */
const SHAPES: Record<RecordTable, (r: Record<string, unknown>) => boolean> = {
  foods: (r) =>
    isString(r.name) &&
    (r.basis === '100g' || r.basis === '100ml') &&
    isNutrients(r.nutrients) &&
    isListOf(r.servings, (s) => isString(s.label) && isNumber(s.grams)),
  foodUsage: (r) =>
    isString(r.foodRef) && isNumber(r.lastAmount) && isString(r.lastUnit) && isString(r.lastUsedAt) && typeof r.favourite === 'boolean',
  recipes: (r) => isString(r.name) && isNumber(r.servings) && r.servings > 0 && isListOf(r.items, (i) => isString(i.foodRef) && isNumber(i.grams)),
  meals: (r) => isString(r.date) && isString(r.name) && isString(r.time),
  mealTemplates: (r) =>
    isString(r.name) &&
    isListOf(r.items, (i) =>
      i.kind === 'food'
        ? isString(i.foodRef) && isNumber(i.amount) && isString(i.unit)
        : i.kind === 'recipe'
          ? isString(i.recipeRef) && isNumber(i.amount)
          : i.kind === 'quick' && isString(i.name) && isNutrients(i.nutrients),
    ),
  days: (r) => isString(r.date) && typeof r.complete === 'boolean' && (r.kind === undefined || r.kind === 'training' || r.kind === 'rest'),
  logEntries: (r) => isString(r.mealId) && isString(r.nameSnapshot) && isNumber(r.amount) && isString(r.unit) && isNutrients(r.nutrientsSnapshot),
  targets: (r) =>
    isString(r.effectiveFrom) &&
    isTargetSet(r) &&
    (r.rest === undefined || (isObject(r.rest) && isTargetSet(r.rest))),
  settings: (r) =>
    (r.lastExportAt === undefined || isString(r.lastExportAt)) &&
    ['waterTargetMl', 'waterSmallMl', 'waterLargeMl'].every((k) => r[k] === undefined || isNumber(r[k])),
  weights: (r) => isString(r.date) && isNumber(r.kg),
  water: (r) => isString(r.date) && isNumber(r.ml),
  exercises: (r) =>
    isString(r.name) &&
    (MUSCLE_GROUPS as readonly unknown[]).includes(r.muscle) &&
    (WEIGHT_UNITS as readonly unknown[]).includes(r.unit) &&
    typeof r.eachSide === 'boolean' &&
    isString(r.note) &&
    (r.plateWeight === undefined || (isObject(r.plateWeight) && isNumber(r.plateWeight.value) && (r.plateWeight.unit === 'kg' || r.plateWeight.unit === 'lb'))),
  routines: (r) =>
    isString(r.name) &&
    Array.isArray(r.weekdays) &&
    r.weekdays.every(isNumber) &&
    isListOf(r.items, (i) => isString(i.exerciseId) && isNumber(i.sets) && isNumber(i.repsMin) && isNumber(i.repsMax)),
  workouts: (r) =>
    isString(r.date) &&
    isString(r.name) &&
    isString(r.startedAt) &&
    Array.isArray(r.exerciseIds) &&
    r.exerciseIds.every(isString) &&
    isListOf(
      r.entries,
      (e) =>
        isString(e.exerciseId) &&
        (WEIGHT_UNITS as readonly unknown[]).includes(e.unit) &&
        isListOf(e.sets, (s) => typeof s.done === 'boolean' && typeof s.warmup === 'boolean'),
    ),
};

function readRecords(file: unknown): Record<RecordTable, BaseRecord[]> {
  if (!isObject(file) || file.format !== EXPORT_FORMAT || typeof file.version !== 'number') {
    throw new ImportError('Not a backup file from this app');
  }
  if (file.version > EXPORT_VERSION) throw new ImportError('This backup was made by a newer version of the app');
  if (!isObject(file.records)) throw new ImportError('This backup file is damaged');
  const out = {} as Record<RecordTable, BaseRecord[]>;
  for (const table of RECORD_TABLES) {
    const list = file.records[table] ?? [];
    if (!Array.isArray(list)) throw new ImportError('This backup file is damaged');
    for (const record of list) {
      if (
        !isObject(record) ||
        !isString(record.id) ||
        record.id === '' ||
        !isString(record.updatedAt) ||
        !isString(record.createdAt) ||
        (record.deletedAt !== undefined && !isString(record.deletedAt)) ||
        !SHAPES[table](record)
      ) {
        throw new ImportError('This backup file is damaged');
      }
    }
    out[table] = list as BaseRecord[];
  }
  return out;
}

/**
 * Merges a backup into the app by record id: a record the app does not have is added, one with
 * a newer `updatedAt` replaces the app's copy, anything else is left alone. The whole file is
 * checked first and written in one transaction, so a bad file changes nothing.
 */
export async function importAll(file: unknown): Promise<{ added: number; updated: number; skipped: number }> {
  const records = readRecords(file);
  const result = { added: 0, updated: 0, skipped: 0 };
  const tables = RECORD_TABLES.map((name) => db.table<BaseRecord, string>(name));
  await db.transaction('rw', tables, async () => {
    for (const name of RECORD_TABLES) {
      const table = db.table<BaseRecord, string>(name);
      for (const incoming of records[name]) {
        const existing = await table.get(incoming.id);
        if (!existing) {
          await table.add(incoming);
          result.added += 1;
        } else if (incoming.updatedAt > existing.updatedAt) {
          await table.put(incoming);
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
      }
    }
  });
  return result;
}
