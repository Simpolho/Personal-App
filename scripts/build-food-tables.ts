/**
 * Builds the food tables that ship with the app. Run with `npm run tables`.
 *
 * Reads (all optional, whatever is there is used):
 *   data-raw/usda-sr-legacy/   unzipped FoodData Central "SR Legacy" CSV download
 *   data-raw/usda-foundation/  unzipped FoodData Central "Foundation Foods" CSV download
 *   data-raw/insa.xlsx         INSA food composition spreadsheet (PortFIR)
 * Writes public/food-tables/usda.json and insa.json, and fails if together they are 5 MB or
 * more when gzipped.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { TABLES_VERSION, type TableFile, type TableFoodRow } from '../src/data/tableFormat';
import { convertInsa } from './food-tables/insa';
import { INSA_COLUMNS } from './food-tables/insa-columns';
import { convertUsda } from './food-tables/usda';

const LIMIT_BYTES = 5 * 1024 * 1024;
const root = fileURLToPath(new URL('..', import.meta.url));
const raw = join(root, 'data-raw');
const out = join(root, 'public', 'food-tables');

const files: TableFile[] = [];

const usdaFoods = new Map<string, TableFoodRow>();
for (const dir of ['usda-sr-legacy', 'usda-foundation']) {
  const path = join(raw, dir);
  if (!existsSync(join(path, 'food.csv'))) {
    console.warn(`skipped: ${dir} (no food.csv in data-raw/${dir})`);
    continue;
  }
  const table = convertUsda(path);
  for (const food of table.foods) usdaFoods.set(food[0], food);
  console.log(`${dir}: ${table.foods.length} foods`);
}
if (usdaFoods.size > 0) files.push({ version: TABLES_VERSION, source: 'usda', foods: [...usdaFoods.values()] });

const insaPath = join(raw, 'insa.xlsx');
if (existsSync(insaPath)) {
  const table = await convertInsa(insaPath, INSA_COLUMNS);
  console.log(`insa: ${table.foods.length} foods`);
  files.push(table);
} else {
  console.warn('skipped: insa (no data-raw/insa.xlsx)');
}

mkdirSync(out, { recursive: true });
let total = 0;
for (const file of files) {
  const json = JSON.stringify(file);
  const gzip = gzipSync(json).length;
  total += gzip;
  writeFileSync(join(out, `${file.source}.json`), json);
  console.log(`${file.source}.json: ${file.foods.length} foods, ${(json.length / 1e6).toFixed(2)} MB, ${(gzip / 1e6).toFixed(2)} MB gzip`);
}
console.log(`total gzip: ${(total / 1e6).toFixed(2)} MB (limit 5 MB)`);
if (files.length === 0) {
  console.error('Nothing to build: put the source files in data-raw/ first.');
  process.exit(1);
}
if (total >= LIMIT_BYTES) {
  console.error('The food tables are 5 MB or more when gzipped.');
  process.exit(1);
}
