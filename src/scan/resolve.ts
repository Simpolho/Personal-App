import { lookupOpenFoodFacts, type LookupResult } from '../data/openFoodFacts';
import { findFoodByBarcode } from '../db/foods';
import type { Food } from '../db/types';

export type ScanOutcome = { kind: 'saved'; food: Food } | LookupResult;

/** What a scanned (already normalized) barcode leads to: a saved food first, then Open Food Facts. */
export async function resolveBarcode(code: string, fetchFn?: typeof fetch): Promise<ScanOutcome> {
  const food = await findFoodByBarcode(code);
  if (food) return { kind: 'saved', food };
  return lookupOpenFoodFacts(code, fetchFn);
}
