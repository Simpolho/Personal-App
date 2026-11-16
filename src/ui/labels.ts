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
