import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { getFood, getUsage, isTableRef, setFavourite } from '../../db/foods';
import { getDay, logFood } from '../../db/log';
import { getTargetsFor } from '../../db/targets';
import type { FoodLike, FoodUsage } from '../../db/types';
import { amountInBase, parseAmount, scaleNutrients, type Nutrients } from '../../domain/nutrients';
import type { TargetValues } from '../../domain/targets';
import { NutrientPreview } from '../components/NutrientPreview';
import { Field, Screen } from '../components/ui';
import { formatNumber } from '../format';
import { btnPrimary, btnSecondary, errorText, input } from '../styles';

const baseUnit = (food: FoodLike) => (food.basis === '100g' ? 'g' : 'ml');

/** Last amount used for this food; else one of its first serving; else 100 g / 100 ml. */
function startingAmount(food: FoodLike, usage: FoodUsage | null): { amount: string; unit: string } {
  const units = [baseUnit(food), ...food.servings.map((s) => s.label)];
  if (usage && usage.lastAmount > 0 && units.includes(usage.lastUnit)) {
    return { amount: formatNumber(usage.lastAmount), unit: usage.lastUnit };
  }
  if (food.servings.length > 0) return { amount: '1', unit: food.servings[0].label };
  return { amount: '100', unit: baseUnit(food) };
}

function AmountForm({
  mealId,
  foodRef,
  food,
  usage,
  dayTotals,
  targets,
}: {
  mealId: string;
  foodRef: string;
  food: FoodLike;
  usage: FoodUsage | null;
  dayTotals: Nutrients;
  targets: TargetValues | null;
}) {
  const navigate = useNavigate();
  const [start] = useState(() => startingAmount(food, usage));
  const [amount, setAmount] = useState(start.amount);
  const [unit, setUnit] = useState(start.unit);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const base = baseUnit(food);
  const parsed = parseAmount(amount);
  const preview = parsed === null ? null : scaleNutrients(food.nutrients, amountInBase(parsed, unit, food.basis, food.servings));
  const favourite = usage?.favourite ?? false;
  const detail = 'brand' in food ? food.brand : food.source === 'usda' ? 'USDA' : 'INSA';

  async function add() {
    if (busy) return;
    if (parsed === null) {
      setError('Enter an amount');
      return;
    }
    setBusy(true);
    await logFood(mealId, foodRef, parsed, unit);
    navigate(`/meal/${mealId}`);
  }

  return (
    <Screen title={food.name} back={`/meal/${mealId}/add`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{[detail, `per 100 ${base}`].filter(Boolean).join(' · ')}</p>
        <button
          type="button"
          aria-pressed={favourite}
          aria-label={favourite ? 'Remove from favourites' : 'Add to favourites'}
          className={`flex size-11 items-center justify-center rounded-full text-2xl ${favourite ? 'text-amber-500' : 'text-zinc-400'}`}
          onClick={() => void setFavourite(foodRef, !favourite)}
        >
          <span aria-hidden="true">{favourite ? '★' : '☆'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input
            className={input}
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError('');
            }}
          />
        </Field>
        <Field label="Unit">
          <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value={base}>{base}</option>
            {food.servings.map((s) => (
              <option key={s.label} value={s.label}>{`${s.label} (${formatNumber(s.grams)} ${base})`}</option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p role="alert" className={errorText}>{error}</p>}

      <NutrientPreview nutrients={preview} dayTotals={dayTotals} targets={targets} />

      <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void add()}>
        Add
      </button>

      {isTableRef(foodRef) ? (
        <button
          type="button"
          className={`${btnSecondary} w-full`}
          onClick={() => navigate(`/foods/new?from=${encodeURIComponent(foodRef)}&meal=${mealId}`)}
        >
          Duplicate to edit
        </button>
      ) : (
        <Link to={`/foods/${foodRef}?meal=${mealId}`} className={`${btnSecondary} w-full`}>
          Edit food
        </Link>
      )}
    </Screen>
  );
}

export function AmountScreen() {
  const { mealId = '', foodRef = '' } = useParams();
  const data = useLiveQuery(async () => {
    const [meal, food] = await Promise.all([db.meals.get(mealId), getFood(foodRef)]);
    if (!meal || meal.deletedAt || !food) return null;
    const [usage, day, targets] = await Promise.all([getUsage(foodRef), getDay(meal.date), getTargetsFor(meal.date)]);
    return { food, usage: usage ?? null, dayTotals: day.totals, targets };
  }, [mealId, foodRef]);

  if (data === undefined) return <Screen title="" back={`/meal/${mealId}/add`} />;
  if (data === null) {
    return (
      <Screen title="Not found" back={`/meal/${mealId}/add`}>
        <p className="text-zinc-600">This food is no longer available.</p>
      </Screen>
    );
  }
  return <AmountForm key={foodRef} mealId={mealId} foodRef={foodRef} {...data} />;
}
