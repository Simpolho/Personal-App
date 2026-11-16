import { nowIso } from '../domain/dates';
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
  const settings: Settings = { id: 'settings', createdAt: existing?.createdAt ?? now, updatedAt: now };
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
      if (!isObject(record) || typeof record.id !== 'string' || record.id === '' || typeof record.updatedAt !== 'string') {
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
