import ExcelJS from 'exceljs';
import { TABLES_VERSION, type TableFile, type TableFoodRow } from '../../src/data/tableFormat';
import { NUTRIENT_KEYS, type NutrientKey } from '../../src/domain/nutrients';

/**
 * Header texts of the columns to read. Line breaks and repeated spaces in the spreadsheet's
 * headers are ignored when matching. `sodiumMg` is used for salt when there is no salt column
 * or its cell is empty. Foods whose `per100ml.column` equals `per100ml.value` are per 100 ml.
 */
export type InsaColumns = { code: string; name: string; per100ml?: { column: string; value: string } } & Partial<
  Record<NutrientKey | 'sodiumMg', string>
>;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return value.result === undefined ? '' : String(value.result);
    if ('text' in value) return String(value.text);
    return '';
  }
  return String(value);
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value).trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? round3(n) : null;
}

function findHeader(ws: ExcelJS.Worksheet, columns: InsaColumns): { row: number; index: Map<string, number> } | null {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const index = new Map<string, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const header = squash(cellText(cell.value));
      if (header && !index.has(header)) index.set(header, col);
    });
    if (index.has(squash(columns.code)) && index.has(squash(columns.name))) return { row: r, index };
  }
  return null;
}

/** Converts the INSA food composition spreadsheet to the app's compact table. */
export async function convertInsa(xlsxPath: string, columns: InsaColumns): Promise<TableFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);

  for (const ws of workbook.worksheets) {
    const header = findHeader(ws, columns);
    if (!header) continue;

    const col = (text: string | undefined, required = true): number | undefined => {
      if (text === undefined) return undefined;
      const at = header.index.get(squash(text));
      if (at === undefined && required) throw new Error(`INSA spreadsheet has no column "${squash(text)}"`);
      return at;
    };
    const codeCol = col(columns.code)!;
    const nameCol = col(columns.name)!;
    const sodiumCol = col(columns.sodiumMg);
    const groupCol = col(columns.per100ml?.column);
    const nutrientCols = NUTRIENT_KEYS.map((key) => col(columns[key]));

    const foods: TableFoodRow[] = [];
    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = squash(cellText(row.getCell(codeCol).value));
      const name = squash(cellText(row.getCell(nameCol).value));
      if (!code || !name) continue;
      const values = NUTRIENT_KEYS.map((key, i) => {
        const at = nutrientCols[i];
        let value = at === undefined ? null : cellNumber(row.getCell(at).value);
        if (key === 'salt' && value === null && sodiumCol !== undefined) {
          const sodium = cellNumber(row.getCell(sodiumCol).value);
          if (sodium !== null) value = round3((sodium * 2.5) / 1000);
        }
        return value;
      });
      if (values[0] === null) continue; // no energy value: no use in a food log
      const per100ml =
        groupCol !== undefined && squash(cellText(row.getCell(groupCol).value)) === squash(columns.per100ml!.value);
      foods.push([`insa:${code}`, name, per100ml ? '100ml' : '100g', values, []]);
    }
    return { version: TABLES_VERSION, source: 'insa', foods };
  }
  throw new Error(`No sheet in ${xlsxPath} has the columns "${columns.code}" and "${columns.name}"`);
}
