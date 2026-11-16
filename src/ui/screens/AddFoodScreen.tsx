import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { favouriteItems, recentItems, recipeItems, searchAll, type SearchResult } from '../../db/search';
import { normalize } from '../../domain/search';
import { Screen } from '../components/ui';
import { btnSecondary, card, input, row } from '../styles';

type Tab = 'recent' | 'favourites' | 'recipes';
const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: 'recent', label: 'Recent', empty: 'Foods you log will show up here.' },
  { id: 'favourites', label: 'Favourites', empty: 'Tap the star on a food to keep it here.' },
  { id: 'recipes', label: 'Recipes', empty: 'No recipes yet.' },
];

function load(tab: Tab): Promise<SearchResult[]> {
  if (tab === 'favourites') return favouriteItems();
  if (tab === 'recipes') return recipeItems();
  return recentItems();
}

export function AddFoodScreen() {
  const { mealId = '' } = useParams();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const searching = normalize(query).length >= 2;
  const results = useLiveQuery(() => (searching ? searchAll(query) : load(tab)), [query, tab, searching]);

  const target = (r: SearchResult) =>
    r.kind === 'recipe' ? `/meal/${mealId}/recipe/${r.ref}` : `/meal/${mealId}/add/${encodeURIComponent(r.ref)}`;

  return (
    <Screen title="Add food" back={`/meal/${mealId}`}>
      <input
        type="search"
        className={input}
        placeholder="Search foods"
        aria-label="Search foods"
        autoComplete="off"
        autoCorrect="off"
        enterKeyHint="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        <Link to={`/meal/${mealId}/quick`} className={btnSecondary}>
          Quick add
        </Link>
        <Link to={`/foods/new?meal=${mealId}`} className={btnSecondary}>
          New food
        </Link>
      </div>

      {!searching && (
        <div role="tablist" aria-label="Lists" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`min-h-9 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-white shadow-sm' : 'text-zinc-600'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!searching && tab === 'recipes' && (
        <Link to="/recipes" className="block px-1 text-sm font-medium text-emerald-700">
          Manage recipes
        </Link>
      )}

      {results && results.length === 0 && (
        <p className="px-1 text-zinc-500">
          {searching ? 'No foods found. Try another word, or add it with “New food”.' : TABS.find((t) => t.id === tab)?.empty}
        </p>
      )}
      {results && results.length > 0 && (
        <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
          {results.map((r) => (
            <li key={`${r.kind}:${r.ref}`}>
              <Link to={target(r)} className={row}>
                <span>{r.name}</span>
                <span className="shrink-0 text-sm text-zinc-500">{r.kind === 'recipe' ? 'Recipe' : (r.detail ?? '')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
