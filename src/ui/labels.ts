import type { ExerciseUnit } from '../db/types';
import type { NutrientKey } from '../domain/nutrients';

/** Form labels, with units. */
export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  kcal: 'Calories (kcal)',
  protein: 'Protein (g)',
  carbs: 'Carbs (g)',
  fat: 'Fat (g)',
  fibre: 'Fibre (g)',
  sugars: 'Sugars (g)',
  saturatedFat: 'Saturated fat (g)',
  salt: 'Salt (g)',
};

export const NUTRIENT_NAMES: Record<NutrientKey, string> = {
  kcal: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fibre: 'Fibre',
  sugars: 'Sugars',
  saturatedFat: 'Saturated fat',
  salt: 'Salt',
};

/** How each weight unit is named in the exercise forms. */
export const WEIGHT_UNIT_NAMES: Record<ExerciseUnit, string> = { kg: 'kg', lb: 'lb' };
