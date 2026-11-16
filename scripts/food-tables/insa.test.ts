// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { convertInsa } from './insa';

async function workbook(rows: (string | number)[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('TCA');
  rows.forEach((r) => ws.addRow(r));
  const file = join(mkdtempSync(join(tmpdir(), 'insa-')), 'insa.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

test('convertInsa maps configured columns and accepts comma decimals', async () => {
  const tmpFile = await workbook([
    ['Código', 'Nome', 'Energia (kcal)', 'Proteína (g)', 'Sódio (mg)'],
    ['IS001', 'Arroz agulha, cru', '358', '7,2', ''],
  ]);
  const t = await convertInsa(tmpFile, { code: 'Código', name: 'Nome', kcal: 'Energia (kcal)', protein: 'Proteína (g)', sodiumMg: 'Sódio (mg)' });
  expect(t.source).toBe('insa');
  expect(t.foods[0]).toEqual(['insa:IS001', 'Arroz agulha, cru', '100g', [358, 7.2, null, null, null, null, null, null], []]);
});
test('convertInsa copes with the real layout: a title row, line breaks in headers, numeric cells, drinks per 100 ml', async () => {
  const tmpFile = await workbook([
    ['', '', 'Grupo e subgrupos', 'Valores por 100 g'],
    ['Cod', 'Nome do alimento', 'Nível 1 ', 'Energia\n[kcal] ', 'Sal  \n[g]', 'Sódio \n[mg]'],
    ['624', 'Abacate, Hass', 'Frutos e produtos derivados de frutos', 176, 0, 15],
    [12, 'Vinho tinto', 'Bebidas alcoólicas', 70, '', 4],
    ['', '', '', '', '', ''],
  ]);
  const t = await convertInsa(tmpFile, {
    code: 'Cod',
    name: 'Nome do alimento',
    kcal: 'Energia [kcal]',
    salt: 'Sal [g]',
    sodiumMg: 'Sódio [mg]',
    per100ml: { column: 'Nível 1', value: 'Bebidas alcoólicas' },
  });
  expect(t.foods).toEqual([
    ['insa:624', 'Abacate, Hass', '100g', [176, null, null, null, null, null, null, 0], []],
    ['insa:12', 'Vinho tinto', '100ml', [70, null, null, null, null, null, null, 0.01], []],
  ]);
});
