import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { listRecipes, recipeNutrientsPerPortion } from '../../db/recipes';
import { formatNutrient } from '../../domain/nutrients';
import { Screen } from '../components/ui';
import { btnPrimary, card, row } from '../styles';

export function RecipesScreen() {
  const recipes = useLiveQuery(async () => {
    const list = await listRecipes();
    return Promise.all(list.map(async (recipe) => ({ recipe, perPortion: await recipeNutrientsPerPortion(recipe) })));
  }, []);

  return (
    <Screen title="Recipes" back="/">
      <Link to="/recipes/new" className={`${btnPrimary} w-full`}>
        New recipe
      </Link>
      {recipes && recipes.length === 0 && <p className="px-1 text-zinc-500">No recipes yet.</p>}
      {recipes && recipes.length > 0 && (
        <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
          {recipes.map(({ recipe, perPortion }) => (
            <li key={recipe.id}>
              <Link to={`/recipes/${recipe.id}`} className={row}>
                <span>{recipe.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                  {`${formatNutrient('kcal', perPortion.kcal ?? 0)} kcal per portion`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
