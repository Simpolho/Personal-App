import { bumpTablesGeneration, db } from '../db/db';
import type { TableFood } from '../db/types';
import { parseTableFile, TABLE_FILES, TABLES_VERSION, type TableFile } from './tableFormat';

export { parseTableFile, TABLE_FILES, TABLES_VERSION, type TableFile, type TableFoodRow } from './tableFormat';

/**
 * Loads the bundled food tables into IndexedDB the first time, and again whenever
 * TABLES_VERSION changes. A table file that is not there (404) is skipped. If any file fails to
 * download, what did arrive is loaded but nothing is marked as done, so the next launch tries again.
 */
export async function ensureTablesLoaded(fetchFn: typeof fetch = fetch): Promise<'loaded' | 'already'> {
  const current = await db.meta.get('tablesVersion');
  if (current?.value === TABLES_VERSION) return 'already';

  const foods: TableFood[] = [];
  let filesRead = 0;
  let failed = false;
  for (const path of TABLE_FILES) {
    try {
      const response = await fetchFn(path);
      if (response.status === 404) continue; // this table is not bundled
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      foods.push(...parseTableFile((await response.json()) as TableFile));
      filesRead += 1;
    } catch {
      failed = true; // offline or a broken download: try again next launch
    }
  }
  if (filesRead === 0) return 'loaded';

  await db.transaction('rw', db.tableFoods, db.meta, async () => {
    await db.tableFoods.clear();
    await db.tableFoods.bulkPut(foods);
    if (!failed) await db.meta.put({ key: 'tablesVersion', value: TABLES_VERSION });
    // Searches on screen watch this marker and refresh when it changes.
    await db.meta.put({ key: 'tablesLoadedAt', value: new Date().toISOString() });
  });
  bumpTablesGeneration();
  return 'loaded';
}
