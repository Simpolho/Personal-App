import type { InsaColumns } from './insa';

/**
 * Column headers of the INSA spreadsheet (sheet "INSA - BDCA_v 7.1 - 2026", header on row 2).
 * In the file the headers have line breaks before the unit; matching ignores those.
 * Values are per 100 g, except the "Bebidas alcoólicas" group, which is per 100 ml.
 */
export const INSA_COLUMNS: InsaColumns = {
  code: 'Cod',
  name: 'Nome do alimento',
  kcal: 'Energia [kcal]',
  protein: 'Proteínas [g]',
  carbs: 'Hidratos de carbono [g]',
  fat: 'Lípidos [g]',
  fibre: 'Fibra [g]',
  sugars: 'Açúcares [g]',
  saturatedFat: 'Ácidos gordos saturados [g]',
  salt: 'Sal [g]',
  sodiumMg: 'Sódio [mg]',
  per100ml: { column: 'Nível 1', value: 'Bebidas alcoólicas' },
};
