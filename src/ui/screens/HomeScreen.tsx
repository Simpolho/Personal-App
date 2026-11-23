import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../db/db';
import { firstEntryAt, getDay, removeEmptyMeals } from '../../db/log';
import { getTargetsFor } from '../../db/targets';
import { addWater, getWaterSettings, undoWater, waterTotal } from '../../db/water';
import { listWeights } from '../../db/weight';
import { backupDue } from '../../domain/backup';
import { formatDayLabel, localDate } from '../../domain/dates';
import { average7, formatChange, formatKg, weeklyChange } from '../../domain/weight';
import { TotalsCard } from '../components/TotalsCard';
import { formatLitres } from '../format';
import { btnPrimary, btnSecondary, card, sectionTitle } from '../styles';

/** Today's date, kept current when the app comes back from the background on a new day. */
function useToday(): string {
  const [today, setToday] = useState(() => localDate(new Date()));
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') setToday(localDate(new Date()));
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);
  return today;
}

function WaterCard({ today }: { today: string }) {
  const water = useLiveQuery(async () => ({ total: await waterTotal(today), settings: await getWaterSettings() }), [today]);
  if (!water) return <section aria-label="Water" className={`${card} h-36`} />;
  const { total, settings } = water;
  return (
    <section aria-label="Water" className={`${card} space-y-3 p-4`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Water</h2>
        <p className="tabular-nums text-zinc-600">{`${formatLitres(total)} / ${formatLitres(settings.targetMl)} L`}</p>
      </div>
      <div
        role="progressbar"
        aria-label="Water"
        aria-valuemin={0}
        aria-valuemax={settings.targetMl}
        aria-valuenow={total}
        className="h-2 overflow-hidden rounded-full bg-zinc-200"
      >
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, (total / settings.targetMl) * 100)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={btnSecondary} onClick={() => void addWater(today, settings.smallMl)}>
          {`+${settings.smallMl} ml`}
        </button>
        <button type="button" className={btnSecondary} onClick={() => void addWater(today, settings.largeMl)}>
          {`+${settings.largeMl} ml`}
        </button>
        <button type="button" className={btnSecondary} disabled={total === 0} onClick={() => void undoWater(today)}>
          Undo
        </button>
      </div>
    </section>
  );
}

function WeightCard({ today }: { today: string }) {
  const weights = useLiveQuery(() => listWeights(), []);
  if (!weights) return <section aria-label="Weight card" className={`${card} h-28`} />;
  const upToToday = weights.filter((w) => w.date <= today);
  const latest = upToToday.at(-1);
  if (!latest) {
    return (
      <section aria-label="Weight card" className={`${card} flex items-center justify-between gap-3 p-4`}>
        <p className="text-zinc-600">No weight yet</p>
        <Link to="/weight" className={btnPrimary}>
          Log weight
        </Link>
      </section>
    );
  }
  const avg = average7(weights, today);
  const change = weeklyChange(weights, today);
  const weighedToday = weights.some((w) => w.date === today);
  return (
    <section aria-label="Weight card" className={`${card} overflow-hidden`}>
      <Link to="/weight" aria-label="Weight" className="block space-y-1 p-4 active:bg-zinc-50">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">Weight</h2>
          <p className="text-xl font-semibold tabular-nums">{`${formatKg(latest.kg)} kg`}</p>
        </div>
        <p className="flex justify-between gap-3 text-sm tabular-nums text-zinc-600">
          <span>{avg !== null ? `7-day avg ${formatKg(avg)} kg` : '7-day avg –'}</span>
          {change !== null && <span>{`${formatChange(change)} kg/wk`}</span>}
        </p>
      </Link>
      {!weighedToday && (
        <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-sm font-medium text-amber-900">Not weighed today</p>
          <Link to="/weight" className={btnPrimary}>
            Log weight
          </Link>
        </div>
      )}
    </section>
  );
}

/** Where the app opens: today's food, water and weight at a glance. */
export function HomeScreen() {
  const today = useToday();
  // A meal left with nothing in it (New meal, then back) doesn't stay on the day.
  useEffect(() => {
    void removeEmptyMeals(today);
  }, [today]);
  const day = useLiveQuery(() => getDay(today), [today]);
  const targets = useLiveQuery(() => getTargetsFor(today), [today]);
  const reminder =
    useLiveQuery(async () => {
      const lastExportAt = (await db.settings.get('settings'))?.lastExportAt;
      return backupDue(lastExportAt, lastExportAt ? undefined : await firstEntryAt(), new Date());
    }, []) ?? false;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-12 items-center justify-between px-4">
          <h1 className="text-lg font-semibold">{formatDayLabel(today)}</h1>
          <Link to="/settings" aria-label="Settings" className="flex size-11 items-center justify-center text-2xl text-zinc-600">
            <span aria-hidden="true">⚙</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {reminder && (
          <Link to="/settings" className="block rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            Last backup over 14 days ago — Export now
          </Link>
        )}
        <TotalsCard totals={day?.totals ?? {}} targets={targets ?? null} loading={day === undefined || targets === undefined} />
        <WaterCard today={today} />
        <WeightCard today={today} />
        <nav className="space-y-2">
          <h2 className={`${sectionTitle} sr-only`}>Go to</h2>
          <Link to={`/day/${today}/log`} className={`${btnPrimary} w-full`}>
            + Log food
          </Link>
          <Link to={`/day/${today}`} className={`${btnSecondary} w-full`}>
            Food log
          </Link>
        </nav>
      </main>
    </div>
  );
}
