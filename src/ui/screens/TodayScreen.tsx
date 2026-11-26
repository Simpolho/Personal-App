import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getDay, removeEmptyMeals, setDayComplete } from '../../db/log';
import { getTargetsFor } from '../../db/targets';
import { addDays, formatDayLabel, localDate } from '../../domain/dates';
import { formatNutrient } from '../../domain/nutrients';
import { TotalsCard } from '../components/TotalsCard';
import { describeAmount } from '../format';
import { btnPrimary, btnSecondary, card } from '../styles';

const arrow = 'flex size-11 items-center justify-center rounded-full text-2xl text-accent-soft active:bg-raised';

export function TodayScreen() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  const day = useLiveQuery(() => (valid ? getDay(date) : undefined), [date, valid]);
  const targets = useLiveQuery(() => (valid ? getTargetsFor(date) : null), [date, valid]);

  // A meal left with nothing in it (New meal, then back) doesn't stay on the day.
  useEffect(() => {
    if (valid) void removeEmptyMeals(date);
  }, [date, valid]);

  if (!valid) return <Navigate to="/" replace />;

  const today = localDate(new Date());
  const meals = day?.meals ?? [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-page/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-12 items-center justify-between px-2">
          <Link to="/" aria-label="Home" className={arrow}>
            <span aria-hidden="true">⌂</span>
          </Link>
          <button type="button" aria-label="Previous day" className={arrow} onClick={() => navigate(`/day/${addDays(date, -1)}`)}>
            <span aria-hidden="true">‹</span>
          </button>
          <div className="text-center leading-tight">
            <h1 className="text-lg font-semibold">{formatDayLabel(date)}</h1>
            {date !== today && (
              <Link to={`/day/${today}`} className="text-sm font-medium text-accent-soft">
                Back to today
              </Link>
            )}
          </div>
          <button type="button" aria-label="Next day" className={arrow} onClick={() => navigate(`/day/${addDays(date, 1)}`)}>
            <span aria-hidden="true">›</span>
          </button>
          <span aria-hidden="true" className="size-11" />
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-32">
        <TotalsCard totals={day?.totals ?? {}} targets={targets ?? null} loading={day === undefined || targets === undefined} />

        {day === undefined ? null : meals.length === 0 ? (
          <p className="px-1 text-muted">Nothing logged yet.</p>
        ) : (
          meals.map(({ meal, entries, totals }) => (
            <Link key={meal.id} to={`/meal/${meal.id}`} className={`${card} block p-4 active:bg-raised`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{`${meal.name} · ${meal.time}`}</h2>
                <span className="shrink-0 text-sm font-medium tabular-nums text-muted">
                  {`${formatNutrient('kcal', totals.kcal ?? 0)} kcal`}
                </span>
              </div>
              {entries.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {entries.map((entry) => {
                    const amount = describeAmount(entry.amount, entry.unit);
                    return (
                      <li key={entry.id} className="flex justify-between gap-3">
                        <span>
                          {entry.nameSnapshot}
                          {amount && <span className="text-muted">{`, ${amount}`}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {formatNutrient('kcal', entry.nutrientsSnapshot.kcal)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Link>
          ))
        )}

        <label className={`${card} flex min-h-11 items-center gap-3 px-4 py-2`}>
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={day?.complete ?? false}
            onChange={(e) => void setDayComplete(date, e.target.checked)}
          />
          Day complete
        </label>

        <Link to="/recipes" className={`${btnSecondary} w-full`}>
          Recipes
        </Link>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-line bg-page/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => navigate(`/day/${date}/log`)}>
          Log food
        </button>
      </div>
    </div>
  );
}
