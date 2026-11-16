import { bumpTablesGeneration, db } from '../db/db';
import type { TableFood } from '../db/types';
import { parseTableFile, TABLE_FILES, TABLES_VERSION, type TableFile } from './tableFormat';

export { parseTableFile, TABLE_FILES, TABLES_VERSION, type TableFile, type TableFoodRow } from './tableFormat';

/**
 * Loads the bundled food tables into IndexedDB the first time, and again whenever
 * TABLES_VERSION changes. A table file that is not there (404) is skipped. If nothing could be
 * fetched at all, nothing is marked as loaded, so the next launch tries again.
 */
export async function ensureTablesLoaded(fetchFn: typeof fetch = fetch): Promise<'loaded' | 'already'> {
  const current = await db.meta.get('tablesVersion');
  if (current?.value === TABLES_VERSION) return 'already';

  const foods: TableFood[] = [];
  let filesRead = 0;
  for (const path of TABLE_FILES) {
    try {
      const response = await fetchFn(path);
      if (!response.ok) continue;
      foods.push(...parseTableFile((await response.json()) as TableFile));
      filesRead += 1;
    } catch {
      // Offline or a broken file: leave it for the next launch.
    }
  }
  if (filesRead === 0) return 'loaded';

  await db.transaction('rw', db.tableFoods, db.meta, async () => {
    await db.tableFoods.clear();
    await db.tableFoods.bulkPut(foods);
    await db.meta.put({ key: 'tablesVersion', value: TABLES_VERSION });
  });
  bumpTablesGeneration();
  return 'loaded';
}
