import { lookupOpenFoodFacts, type LookupResult } from '../data/openFoodFacts';
import { findFoodByBarcode } from '../db/foods';
import type { Food } from '../db/types';

export type ScanOutcome = { kind: 'saved'; food: Food } | LookupResult;

/** What a scanned (already normalized) barcode leads to: a saved food first, then Open Food Facts. */
export async function resolveBarcode(code: string, fetchFn?: typeof fetch, signal?: AbortSignal): Promise<ScanOutcome> {
  const food = await findFoodByBarcode(code);
  if (food) return { kind: 'saved', food };
  return lookupOpenFoodFacts(code, fetchFn, undefined, signal);
}

/** Where a scan outcome leads: the saved food's amount screen, the food editor to check, or New food. */
export function scanDestination(mealId: string, code: string, outcome: ScanOutcome): { to: string; state?: unknown } {
  if (outcome.kind === 'saved') return { to: `/meal/${mealId}/add/${outcome.food.id}` };
  if (outcome.kind === 'found') return { to: `/foods/new?meal=${mealId}&barcode=${code}`, state: { draft: outcome.draft } };
  return { to: `/foods/new?meal=${mealId}&barcode=${code}&reason=${outcome.kind}` };
}
