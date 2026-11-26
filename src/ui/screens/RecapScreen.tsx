import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import { bodyKgOn } from '../../db/weight';
import { previousRoutineWorkout } from '../../db/workouts';
import { recapOf, withChanges, workoutMinutes } from '../../domain/workouts';
import { Screen } from '../components/ui';
import { btnDone, card } from '../styles';

const kg = (v: number) => Math.round(v).toLocaleString('en-US');

function change(value: number | undefined): string | null {
  if (value === undefined) return null;
  if (Math.abs(value) < 1) return '=';
  return `${value > 0 ? '▲' : '▼'} ${kg(Math.abs(value))}`;
}

const LEFT_OUT = {
  plates: "isn't in the volume: set its plate weight.",
  bodyweight: "isn't in the volume: log your weight first.",
} as const;

/** After Finish, and from a past workout: sets and volume per muscle group against last time. */
export function RecapScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const workout = await db.workouts.get(id);
    if (!workout || !isLive(workout)) return null;
    // Exercises deleted since still name past workouts, so they're all read here.
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const previous = workout.routineId ? await previousRoutineWorkout(workout.routineId, workout.startedAt) : undefined;
    const now = recapOf(workout, exercises, await bodyKgOn(workout.date));
    const before = previous ? recapOf(previous, exercises, await bodyKgOn(previous.date)) : null;
    return { workout, recap: withChanges(now, before), compared: previous !== undefined };
  }, [id]);

  if (data === undefined) return <Screen title="" back="/workouts" />;
  if (data === null) {
    return (
      <Screen title="Not found" back="/workouts">
        <p className="text-muted">This workout is no longer available.</p>
      </Screen>
    );
  }
  const { workout, recap, compared } = data;
  const minutes = workoutMinutes(workout);

  return (
    <Screen
      title={minutes === null ? `${workout.name} · done` : `${workout.name} · done · ${minutes} min`}
      back={`/workout/${workout.id}`}
      footer={
        <button type="button" className={`${btnDone} w-full`} onClick={() => navigate('/')}>
          Done
        </button>
      }
    >
      <section className={`${card} p-4`}>
        {compared && <p className="mb-2 text-right text-sm text-muted">{`vs last ${workout.name}`}</p>}
        {recap.rows.length === 0 ? (
          <p className="text-muted">No sets were done.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recap.rows.map((r) => {
              const delta = change(r.change);
              return (
                <li key={r.muscle} aria-label={r.muscle} className="grid grid-cols-[1fr_auto_auto_3.5rem] items-center gap-3 py-2 tabular-nums">
                  <span className="font-medium">{r.muscle}</span>
                  <span className="text-muted">{r.sets === 1 ? '1 set' : `${r.sets} sets`}</span>
                  <span className="text-right">{`${kg(r.volume)} kg`}</span>
                  <span className={`text-right text-sm font-medium ${delta?.startsWith('▲') ? 'text-good' : delta?.startsWith('▼') ? 'text-danger' : 'text-muted'}`}>
                    {delta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {recap.leftOut.map((l) => (
        <p key={l.name} className="rounded-xl bg-warn/15 p-3 text-sm text-warn ring-1 ring-warn/30">{`${l.name} ${LEFT_OUT[l.reason]}`}</p>
      ))}
    </Screen>
  );
}
