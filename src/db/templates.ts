import { localTime } from '../domain/dates';
import { db } from './db';
import { getMealView, keepDayKind, logFood, quickAdd } from './log';
import { isLive, newRecord, softDeleted } from './records';
import { logRecipe } from './recipes';
import type { Meal, MealTemplate, TemplateItem } from './types';

/** Saves a meal's current foods under a name so it can be repeated on another day. */
export async function saveMealAsTemplate(mealId: string, name: string): Promise<MealTemplate> {
  const view = await getMealView(mealId);
  if (!view) throw new Error('Meal not found');
  const items: TemplateItem[] = view.entries.map((e) => {
    if (e.foodRef) return { kind: 'food', foodRef: e.foodRef, amount: e.amount, unit: e.unit };
    if (e.recipeRef) return { kind: 'recipe', recipeRef: e.recipeRef, amount: e.amount };
    return { kind: 'quick', name: e.nameSnapshot, nutrients: e.nutrientsSnapshot };
  });
  const template: MealTemplate = newRecord({ name: name.trim() || view.meal.name, items });
  await db.mealTemplates.add(template);
  return template;
}

export async function listTemplates(): Promise<MealTemplate[]> {
  return (await db.mealTemplates.toArray()).filter(isLive).sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await db.mealTemplates.get(id);
  if (template && isLive(template)) await db.mealTemplates.put(softDeleted(template));
}

/**
 * Creates a meal on `date` from a saved meal. Its foods are logged fresh, with today's values.
 * All or nothing: if one item can no longer be logged, no meal is created and this throws.
 */
export async function applyTemplate(templateId: string, date: string, now: Date = new Date()): Promise<Meal> {
  const template = await db.mealTemplates.get(templateId);
  if (!template || !isLive(template)) throw new Error('Saved meal not found');
  const created = await db.transaction('rw', [db.meals, db.logEntries, db.foodUsage, db.foods, db.tableFoods, db.recipes], async () => {
    const meal: Meal = newRecord({ date, name: template.name, time: localTime(now) });
    await db.meals.add(meal);
    for (const item of template.items) {
      if (item.kind === 'food') await logFood(meal.id, item.foodRef, item.amount, item.unit);
      else if (item.kind === 'recipe') await logRecipe(meal.id, item.recipeRef, item.amount);
      else await quickAdd(meal.id, item.name, item.nutrients);
    }
    return meal;
  });
  await keepDayKind(date);
  return created;
}
