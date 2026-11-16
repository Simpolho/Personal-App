import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { getFood } from '../../db/foods';
import { deleteRecipe, saveRecipe } from '../../db/recipes';
import { searchAll } from '../../db/search';
import type { Recipe } from '../../db/types';
import { formatNutrient, parseAmount, scaleNutrients, scaleSnapshot, sumNutrients, type Nutrients } from '../../domain/nutrients';
import { normalize } from '../../domain/search';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { formatNumber, formatWhole } from '../format';
import { btnDanger, btnPrimary, card, errorText, input, row } from '../styles';

type Ingredient = { foodRef: string; name: string; unit: 'g' | 'ml'; nutrients: Nutrients; grams: string };

async function toIngredient(foodRef: string, grams: string): Promise<Ingredient> {
  const food = await getFood(foodRef);
  return {
    foodRef,
    name: food?.name ?? 'Food no longer available',
    unit: food?.basis === '100ml' ? 'ml' : 'g',
    nutrients: food?.nutrients ?? {},
    grams,
  };
}

function RecipeForm({ existing, startIngredients }: { existing: Recipe | null; startIngredients: Ingredient[] }) {
  const navigate = useNavigate();
  const [name, setName] = useState(existing?.name ?? '');
  const [portions, setPortions] = useState(existing ? formatNumber(existing.servings) : '1');
  const [ingredients, setIngredients] = useState(startIngredients);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const searching = normalize(query).length >= 2;
  const results = useLiveQuery(
    async () => (searching ? (await searchAll(query)).filter((r) => r.kind === 'food') : []),
    [query, searching],
  );

  const portionCount = parseAmount(portions);
  const amounts = ingredients.map((i) => parseAmount(i.grams));
  const perPortion =
    portionCount !== null && ingredients.length > 0 && amounts.every((a) => a !== null)
      ? scaleSnapshot(sumNutrients(ingredients.map((i, n) => scaleNutrients(i.nutrients, amounts[n]!))), 1 / portionCount)
      : null;

  async function addIngredient(foodRef: string) {
    const ingredient = await toIngredient(foodRef, '100');
    setIngredients((list) => [...list, ingredient]);
    setQuery('');
    setError('');
  }

  async function save() {
    if (busy) return;
    if (name.trim() === '') return setError('Enter a name');
    if (portionCount === null) return setError('Enter how many portions it makes');
    if (ingredients.length === 0) return setError('Add at least one ingredient');
    const items: { foodRef: string; grams: number }[] = [];
    for (const [n, ingredient] of ingredients.entries()) {
      const grams = amounts[n];
      if (grams === null) return setError(`Enter the amount of ${ingredient.name}`);
      items.push({ foodRef: ingredient.foodRef, grams });
    }
    setBusy(true);
    await saveRecipe({ id: existing?.id, name, items, servings: portionCount });
    navigate('/recipes');
  }

  return (
    <Screen title={existing ? 'Edit recipe' : 'New recipe'} back="/recipes">
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Recipe name">
          <input className={input} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
        </Field>
        <Field label="Portions">
          <input className={input} inputMode="decimal" value={portions} onChange={(e) => { setPortions(e.target.value); setError(''); }} />
        </Field>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-600">Ingredients</h2>
        {ingredients.length > 0 && (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {ingredients.map((ingredient, index) => (
              <li key={`${ingredient.foodRef}:${index}`} className="grid grid-cols-[1fr_5.5rem_auto_2.75rem] items-center gap-2 px-4 py-2">
                <span>{ingredient.name}</span>
                <input
                  className={input}
                  inputMode="decimal"
                  aria-label={`Grams of ${ingredient.name}`}
                  value={ingredient.grams}
                  onChange={(e) => {
                    setIngredients(ingredients.map((it, i) => (i === index ? { ...it, grams: e.target.value } : it)));
                    setError('');
                  }}
                />
                <span className="text-zinc-500">{ingredient.unit}</span>
                <button
                  type="button"
                  aria-label={`Remove ${ingredient.name}`}
                  className="flex size-11 items-center justify-center text-xl text-red-700"
                  onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          type="search"
          className={input}
          placeholder="Search ingredients"
          aria-label="Search ingredients"
          autoComplete="off"
          autoCorrect="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && results && results.length === 0 && <p className="px-1 text-zinc-500">No foods found.</p>}
        {searching && results && results.length > 0 && (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {results.map((r) => (
              <li key={r.ref}>
                <button type="button" className={row} onClick={() => void addIngredient(r.ref)}>
                  <span>{r.name}</span>
                  <span className="shrink-0 text-sm text-zinc-500">{r.detail ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Per portion" className={`${card} space-y-1 p-4`}>
        {perPortion ? (
          <>
            <p className="text-xl font-semibold tabular-nums">{`${formatNutrient('kcal', perPortion.kcal ?? 0)} kcal per portion`}</p>
            <p className="text-sm tabular-nums text-zinc-600">
              {`P ${formatWhole(perPortion.protein ?? 0)} g · C ${formatWhole(perPortion.carbs ?? 0)} g · F ${formatWhole(perPortion.fat ?? 0)} g`}
            </p>
          </>
        ) : (
          <p className="text-zinc-500">Add ingredients and amounts to see the numbers per portion.</p>
        )}
      </section>

      {error && <p role="alert" className={errorText}>{error}</p>}
      <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void save()}>
        Save
      </button>
      {existing && (
        <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirmDelete(true)}>
          Delete recipe
        </button>
      )}
      {existing && confirmDelete && (
        <ConfirmDialog
          title={`Delete “${existing.name}”?`}
          message="Days where it is already logged keep their numbers."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void deleteRecipe(existing.id).then(() => navigate('/recipes', { replace: true }));
          }}
        />
      )}
    </Screen>
  );
}

export function RecipeEditorScreen() {
  const { id = 'new' } = useParams();
  const [loaded, setLoaded] = useState<{ id: string; existing: Recipe | null; ingredients: Ingredient[] } | null>(null);

  // Read once per recipe: the form must not reset while it is being edited.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = id === 'new' ? undefined : await db.recipes.get(id);
      const existing = found && !found.deletedAt ? found : null;
      const ingredients = existing
        ? await Promise.all(existing.items.map((item) => toIngredient(item.foodRef, formatNumber(item.grams))))
        : [];
      if (!cancelled) setLoaded({ id, existing, ingredients });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loaded?.id !== id) return <Screen title="" back="/recipes" />;
  if (id !== 'new' && !loaded.existing) {
    return (
      <Screen title="Not found" back="/recipes">
        <p className="text-zinc-600">This recipe is no longer available.</p>
      </Screen>
    );
  }
  return <RecipeForm key={id} existing={loaded.existing} startIngredients={loaded.ingredients} />;
}
