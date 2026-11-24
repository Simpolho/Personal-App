import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { listExercises, listRoutines } from '../../db/workouts';
import { Screen } from '../components/ui';
import { btnSecondary, card, row, sectionTitle } from '../styles';

/** Routines and exercises, each leading to its editor. */
export function RoutinesScreen() {
  const routines = useLiveQuery(() => listRoutines(), []);
  const exercises = useLiveQuery(() => listExercises(), []);
  return (
    <Screen title="Routines and exercises" back="/workouts">
      <section className="space-y-2">
        <h2 className={sectionTitle}>Routines</h2>
        {routines && routines.length > 0 && (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {routines.map((r) => (
              <li key={r.id}>
                <Link to={`/routines/${r.id}`} className={row}>
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/routines/new" className={`${btnSecondary} w-full`}>
          New routine
        </Link>
      </section>
      <section className="space-y-2">
        <h2 className={sectionTitle}>Exercises</h2>
        {exercises && exercises.length > 0 && (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {exercises.map((e) => (
              <li key={e.id}>
                <Link to={`/exercises/${e.id}`} aria-label={e.name} className={row}>
                  <span>{e.name}</span>
                  <span className="text-sm text-zinc-500">{e.muscle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to="/exercises/new" className={`${btnSecondary} w-full`}>
          New exercise
        </Link>
      </section>
    </Screen>
  );
}
