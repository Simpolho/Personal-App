import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { getUsage } from '../../db/foods';
import { getDay } from '../../db/log';
import { logRecipe, recipeNutrientsPerPortion } from '../../db/recipes';
import { getTargetsFor } from '../../db/targets';
import type { Recipe } from '../../db/types';
import { parseAmount, scaleSnapshot, type Nutrients } from '../../domain/nutrients';
import type { TargetValues } from '../../domain/targets';
import { NutrientPreview } from '../components/NutrientPreview';
import { Field, Screen } from '../components/ui';
import { formatNumber } from '../format';
import { btnPrimary, errorText, input } from '../styles';

function PortionForm({
  mealId,
  recipe,
  perPortion,
  lastPortions,
  dayTotals,
  targets,
}: {
  mealId: string;
  recipe: Recipe;
  perPortion: Nutrients;
  lastPortions: number | null;
  dayTotals: Nutrients;
  targets: TargetValues | null;
}) {
  const navigate = useNavigate();
  const [portions, setPortions] = useState(() => (lastPortions ? formatNumber(lastPortions) : '1'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parseAmount(portions);

  async function add() {
    if (busy) return;
    if (parsed === null) {
      setError('Enter how many portions');
      return;
    }
    setBusy(true);
    await logRecipe(mealId, recipe.id, parsed);
    navigate(`/meal/${mealId}`);
  }

  return (
    <Screen title={recipe.name} back={`/meal/${mealId}/add`}>
      <p className="text-sm text-zinc-500">{`Recipe · makes ${formatNumber(recipe.servings)} ${recipe.servings === 1 ? 'portion' : 'portions'}`}</p>
      <Field label="Portions">
        <input
          className={input}
          inputMode="decimal"
          value={portions}
          onChange={(e) => {
            setPortions(e.target.value);
            setError('');
          }}
        />
      </Field>
      {error && <p role="alert" className={errorText}>{error}</p>}
      <NutrientPreview nutrients={parsed === null ? null : scaleSnapshot(perPortion, parsed)} dayTotals={dayTotals} targets={targets} />
      <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void add()}>
        Add
      </button>
    </Screen>
  );
}

export function RecipePortionScreen() {
  const { mealId = '', recipeId = '' } = useParams();
  const data = useLiveQuery(async () => {
    const [meal, recipe] = await Promise.all([db.meals.get(mealId), db.recipes.get(recipeId)]);
    if (!meal || meal.deletedAt || !recipe || recipe.deletedAt) return null;
    const [perPortion, usage, day, targets] = await Promise.all([
      recipeNutrientsPerPortion(recipe),
      getUsage(recipeId),
      getDay(meal.date),
      getTargetsFor(meal.date),
    ]);
    const lastPortions = usage && usage.lastUnit === 'portion' && usage.lastAmount > 0 ? usage.lastAmount : null;
    return { recipe, perPortion, lastPortions, dayTotals: day.totals, targets };
  }, [mealId, recipeId]);

  if (data === undefined) return <Screen title="" back={`/meal/${mealId}/add`} />;
  if (data === null) {
    return (
      <Screen title="Not found" back={`/meal/${mealId}/add`}>
        <p className="text-zinc-600">This recipe is no longer available.</p>
      </Screen>
    );
  }
  return <PortionForm key={recipeId} mealId={mealId} {...data} />;
}
