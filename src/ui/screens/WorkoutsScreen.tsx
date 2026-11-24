import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Routine } from '../../db/types';
import { getActiveWorkout, listFinishedWorkouts, listRoutines, startWorkout } from '../../db/workouts';
import { formatDayLabel, localDate } from '../../domain/dates';
import { routinesForDate, workoutMinutes } from '../../domain/workouts';
import { Field, Screen } from '../components/ui';
import { useToday } from '../useToday';
import { btnPrimary, btnSecondary, card, input, row, sectionTitle } from '../styles';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(y!, m! - 1, d!).getDay()]!;
};

/** Noon on a local date, as the start of a workout logged afterwards. */
function noonOn(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12).toISOString();
}

export function WorkoutsScreen() {
  const today = useToday();
  const navigate = useNavigate();
  const routines = useLiveQuery(() => listRoutines(), []);
  const active = useLiveQuery(() => getActiveWorkout(), []);
  const history = useLiveQuery(() => listFinishedWorkouts(), []);
  const [pastDate, setPastDate] = useState(() => localDate(new Date()));
  const [pastRoutine, setPastRoutine] = useState('');
  const [starting, setStarting] = useState(false);
  const busy = active !== undefined || starting;

  async function start(routine: Routine | undefined, date = today, startedAt?: string) {
    setStarting(true);
    try {
      const w = await startWorkout({ routineId: routine?.id, date, startedAt });
      navigate(`/workout/${w.id}`);
    } finally {
      setStarting(false);
    }
  }

  const planned = routinesForDate(routines ?? [], today);
  const others = (routines ?? []).filter((r) => !planned.includes(r));
  const startButton = (r: Routine) => (
    <button type="button" aria-label={`Start ${r.name}`} className={btnPrimary} disabled={busy} onClick={() => void start(r)}>
      Start
    </button>
  );

  return (
    <Screen title="Workouts" back="/">
      {active && (
        <Link to={`/workout/${active.id}`} className={`${btnPrimary} w-full`}>
          {`Resume ${active.name}`}
        </Link>
      )}

      <section aria-label="Today" className={`${card} space-y-2 p-4`}>
        <h2 className="text-sm font-medium text-zinc-500">{`Today · ${weekdayOf(today)}`}</h2>
        {routines !== undefined && planned.length === 0 && <p className="text-lg font-medium">Rest day</p>}
        {planned.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{r.name}</p>
              <p className="text-sm text-zinc-500">{r.items.length === 1 ? '1 exercise' : `${r.items.length} exercises`}</p>
            </div>
            {startButton(r)}
          </div>
        ))}
      </section>

      <section aria-label="Other routines" className="space-y-2">
        <h2 className={sectionTitle}>Other routines</h2>
        <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
          {others.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span className="font-medium">{r.name}</span>
              {startButton(r)}
            </li>
          ))}
          <li className="p-2">
            <button type="button" className={`${btnSecondary} w-full`} disabled={busy} onClick={() => void start(undefined)}>
              Empty workout
            </button>
          </li>
        </ul>
      </section>

      <section aria-label="Past workouts" className="space-y-2">
        <h2 className={sectionTitle}>Past workouts</h2>
        {history !== undefined && history.length === 0 ? (
          <p className="px-1 text-zinc-500">None yet</p>
        ) : (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {(history ?? []).map((w) => {
              const minutes = workoutMinutes(w);
              return (
                <li key={w.id}>
                  <Link to={`/workout/${w.id}`} className={row}>
                    {`${formatDayLabel(w.date)} · ${w.name}${minutes === null ? '' : ` · ${minutes} min`}`}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Log a past workout" className="space-y-2">
        <h2 className={sectionTitle}>Log a past workout</h2>
        <div className={`${card} space-y-3 p-4`}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                className={`${input} block min-w-0 appearance-none`}
                value={pastDate}
                max={today}
                onChange={(e) => setPastDate(e.target.value)}
              />
            </Field>
            <Field label="Routine">
              <select className={input} value={pastRoutine} onChange={(e) => setPastRoutine(e.target.value)}>
                <option value="">Empty workout</option>
                {(routines ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            aria-label="Start past workout"
            className={`${btnSecondary} w-full`}
            disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(pastDate) || pastDate > today}
            onClick={() => void start(routines?.find((r) => r.id === pastRoutine), pastDate, noonOn(pastDate))}
          >
            Start
          </button>
        </div>
      </section>

      <Link to="/workouts/routines" className={`${btnSecondary} w-full`}>
        Routines and exercises
      </Link>
    </Screen>
  );
}
