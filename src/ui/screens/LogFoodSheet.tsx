import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createMeal, getDay } from '../../db/log';
import { Screen } from '../components/ui';
import { card, row, sectionTitle } from '../styles';

/** "Add to…": a new meal, a saved meal, or one of the day's meals. */
export function LogFoodSheet() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const day = useLiveQuery(() => getDay(date), [date]);
  const [busy, setBusy] = useState(false);

  async function newMeal() {
    if (busy) return;
    setBusy(true);
    const meal = await createMeal(date);
    navigate(`/meal/${meal.id}/add`);
  }

  return (
    <Screen title="Add to…" back={`/day/${date}`}>
      <div className={`${card} divide-y divide-line overflow-hidden`}>
        <button type="button" className={row} onClick={() => void newMeal()}>
          <span>
            <span aria-hidden="true" className="mr-2 text-accent-soft">+</span>
            New meal
          </span>
        </button>
        <button type="button" className={row} onClick={() => navigate(`/day/${date}/templates`)}>
          <span>
            <span aria-hidden="true" className="mr-2 text-accent-soft">↻</span>
            Repeat a saved meal
          </span>
        </button>
      </div>

      {day && day.meals.length > 0 && (
        <section className="space-y-2">
          <h2 className={sectionTitle}>Meals</h2>
          <div className={`${card} divide-y divide-line overflow-hidden`}>
            {day.meals.map(({ meal }) => (
              <button key={meal.id} type="button" className={row} onClick={() => navigate(`/meal/${meal.id}/add`)}>
                {`${meal.name} · ${meal.time}`}
              </button>
            ))}
          </div>
        </section>
      )}
    </Screen>
  );
}
