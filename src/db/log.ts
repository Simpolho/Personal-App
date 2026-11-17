import { localTime } from '../domain/dates';
import { amountInBase, scaleNutrients, scaleSnapshot, sumNutrients, type Nutrients } from '../domain/nutrients';
import { db } from './db';
import { cleanNutrients, getFood, recordUsage } from './foods';
import { isLive, newRecord, softDeleted, touched } from './records';
import type { LogEntry, Meal } from './types';

export interface MealView {
  meal: Meal;
  entries: LogEntry[];
  totals: Nutrients;
}

export interface DayView {
  date: string;
  complete: boolean;
  meals: MealView[];
  totals: Nutrients;
}

const MEAL_N = /^Meal (\d+)$/;

export function nextMealName(names: string[]): string {
  let highest = 0;
  for (const name of names) {
    const match = MEAL_N.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Meal ${highest + 1}`;
}

async function liveMeals(date: string): Promise<Meal[]> {
  return (await db.meals.where('date').equals(date).toArray()).filter(isLive);
}

async function liveEntries(mealId: string): Promise<LogEntry[]> {
  return (await db.logEntries.where('mealId').equals(mealId).toArray()).filter(isLive);
}

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;

/** New meal on `date` (the date on screen, whatever the clock says), named "Meal N", timed now. */
export async function createMeal(date: string, now: Date = new Date()): Promise<Meal> {
  const names = (await liveMeals(date)).map((m) => m.name);
  const meal: Meal = newRecord({ date, name: nextMealName(names), time: localTime(now) });
  await db.meals.add(meal);
  return meal;
}

async function updateMeal(id: string, change: Partial<Pick<Meal, 'name' | 'time'>>): Promise<void> {
  const meal = await db.meals.get(id);
  if (meal && isLive(meal)) await db.meals.put(touched({ ...meal, ...change }));
}

export async function renameMeal(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed) await updateMeal(id, { name: trimmed });
}

export async function setMealTime(id: string, time: string): Promise<void> {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) await updateMeal(id, { time });
}

/** Removes a meal and its entries from the day (soft delete). */
export async function deleteMeal(id: string): Promise<void> {
  await db.transaction('rw', db.meals, db.logEntries, async () => {
    const meal = await db.meals.get(id);
    if (!meal || !isLive(meal)) return;
    const entries = await liveEntries(id);
    await db.logEntries.bulkPut(entries.map(softDeleted));
    await db.meals.put(softDeleted(meal));
  });
}

/** Logs a food. The entry keeps its own copy of the name and nutrient totals. */
export async function logFood(mealId: string, foodRef: string, amount: number, unit: string): Promise<LogEntry> {
  const food = await getFood(foodRef);
  if (!food) throw new Error('Food not found');
  const base = amountInBase(amount, unit, food.basis, food.servings);
  const brand = 'brand' in food ? food.brand : undefined;
  const entry: LogEntry = newRecord({
    mealId,
    foodRef,
    recipeRef: undefined,
    nameSnapshot: brand ? `${food.name}, ${brand}` : food.name,
    amount,
    unit,
    nutrientsSnapshot: scaleNutrients(food.nutrients, base),
  });
  await db.logEntries.add(entry);
  await recordUsage(foodRef, amount, unit);
  return entry;
}

/** An entry with just a name (optional), calories and macros; no food attached. */
export async function quickAdd(mealId: string, name: string | undefined, nutrients: Nutrients): Promise<LogEntry> {
  const entry: LogEntry = newRecord({
    mealId,
    foodRef: undefined,
    recipeRef: undefined,
    nameSnapshot: name?.trim() || 'Quick add',
    amount: 1,
    unit: 'quick',
    nutrientsSnapshot: cleanNutrients(nutrients),
  });
  await db.logEntries.add(entry);
  return entry;
}

async function requireEntry(id: string): Promise<LogEntry> {
  const entry = await db.logEntries.get(id);
  if (!entry || !isLive(entry)) throw new Error('Entry not found');
  return entry;
}

/**
 * Changes an entry's amount by scaling its stored totals (new base amount ÷ old base amount).
 * The food's nutrients are never read again; only its serving sizes are, and only when the
 * unit changes.
 */
export async function updateEntryAmount(id: string, amount: number, unit: string): Promise<LogEntry> {
  const entry = await requireEntry(id);
  let factor: number;
  if (unit === entry.unit) {
    factor = amount / entry.amount;
  } else {
    const food = entry.foodRef ? await getFood(entry.foodRef) : undefined;
    if (!food) throw new Error('This entry can only be changed in its own unit');
    const before = amountInBase(entry.amount, entry.unit, food.basis, food.servings);
    factor = amountInBase(amount, unit, food.basis, food.servings) / before;
  }
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Enter an amount');
  const updated = touched({ ...entry, amount, unit, nutrientsSnapshot: scaleSnapshot(entry.nutrientsSnapshot, factor) });
  await db.logEntries.put(updated);
  if (entry.foodRef) await recordUsage(entry.foodRef, amount, unit);
  else if (entry.recipeRef) await recordUsage(entry.recipeRef, amount, unit);
  return updated;
}

export async function updateQuickAdd(id: string, name: string | undefined, nutrients: Nutrients): Promise<LogEntry> {
  const entry = await requireEntry(id);
  const updated = touched({
    ...entry,
    nameSnapshot: name?.trim() || 'Quick add',
    nutrientsSnapshot: cleanNutrients(nutrients),
  });
  await db.logEntries.put(updated);
  return updated;
}

export async function deleteEntry(id: string): Promise<void> {
  const entry = await db.logEntries.get(id);
  if (entry && isLive(entry)) await db.logEntries.put(softDeleted(entry));
}

/** One meal with its live entries, oldest first. */
export async function getMealView(mealId: string): Promise<MealView | undefined> {
  const meal = await db.meals.get(mealId);
  if (!meal || !isLive(meal)) return undefined;
  const entries = (await liveEntries(mealId)).sort(byCreated);
  return { meal, entries, totals: sumNutrients(entries.map((e) => e.nutrientsSnapshot)) };
}

/** The day as shown on the Today screen: live meals by time, live entries in the order logged. */
export async function getDay(date: string): Promise<DayView> {
  const meals = (await liveMeals(date)).sort((a, b) => a.time.localeCompare(b.time) || byCreated(a, b));
  const views: MealView[] = [];
  for (const meal of meals) {
    const entries = (await liveEntries(meal.id)).sort(byCreated);
    views.push({ meal, entries, totals: sumNutrients(entries.map((e) => e.nutrientsSnapshot)) });
  }
  const day = await db.days.get(date);
  return {
    date,
    complete: Boolean(day && isLive(day) && day.complete),
    meals: views,
    totals: sumNutrients(views.map((v) => v.totals)),
  };
}

/**
 * Removes the day's meals that have nothing in them (e.g. "New meal", then back without adding
 * a food), so they don't sit on the day as "Meal 2 · 0 kcal". Called when the day is shown.
 */
export async function removeEmptyMeals(date: string): Promise<void> {
  await db.transaction('rw', db.meals, db.logEntries, async () => {
    for (const meal of await liveMeals(date)) {
      if ((await liveEntries(meal.id)).length === 0) await db.meals.put(softDeleted(meal));
    }
  });
}

export async function setDayComplete(date: string, complete: boolean): Promise<void> {
  const existing = await db.days.get(date);
  if (existing) {
    const { deletedAt: _undeleted, ...rest } = existing;
    await db.days.put(touched({ ...rest, complete }));
  } else {
    await db.days.put(newRecord({ id: date, date, complete }));
  }
}

/** When the first entry still in the log was made; the backup reminder counts from here. */
export async function firstEntryAt(): Promise<string | undefined> {
  let earliest: string | undefined;
  await db.logEntries.each((entry) => {
    if (isLive(entry) && (earliest === undefined || entry.createdAt < earliest)) earliest = entry.createdAt;
  });
  return earliest;
}

/** Names the user has given meals before (not "Meal N"), most recent first, for rename suggestions. */
export async function pastMealNames(limit = 20): Promise<string[]> {
  const meals = (await db.meals.toArray()).filter((m) => isLive(m) && !MEAL_N.test(m.name));
  meals.sort((a, b) => byCreated(b, a));
  const names: string[] = [];
  for (const meal of meals) {
    if (!names.includes(meal.name)) names.push(meal.name);
    if (names.length >= limit) break;
  }
  return names;
}
