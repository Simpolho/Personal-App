import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import type { ExerciseUnit } from '../../db/types';
import { getExerciseHistory } from '../../db/workouts';
import { formatDayLabel } from '../../domain/dates';
import { bestEver, formatHistorySet, type HistorySession } from '../../domain/history';
import { Screen } from '../components/ui';
import { editPath, historyBack } from '../exerciseLinks';
import { btnSecondary, card } from '../styles';

const plain = (s: HistorySession['best'] & object) => formatHistorySet({ ...s, rpe: undefined });

/** "80×6 @8 · 80×6 · 77.5×7", naming the unit when it isn't the exercise's current one. */
function setsLine(s: HistorySession, unit: ExerciseUnit): string {
  return s.sets.map(formatHistorySet).join(' · ') + (s.unit !== unit ? ` · ${s.unit}` : '');
}

/** "Best 80×6 · est. max 96" — no estimated max for plates or 0 kg sets. */
function sessionBest(s: HistorySession): string {
  return `Best ${plain(s.best!)}${s.bestMax !== null ? ` · est. max ${Math.round(s.bestMax)}` : ''}`;
}

/** Every session of one exercise, newest first, with its best set and estimated max. */
export function ExerciseHistoryScreen() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from');
  const back = historyBack(from);
  const data = useLiveQuery(async () => {
    const exercise = await db.exercises.get(id);
    if (!exercise || !isLive(exercise)) return { exercise: null, sessions: [] };
    return { exercise, sessions: await getExerciseHistory(id) };
  }, [id]);

  if (!data) return <Screen title="" back={back} />;
  if (!data.exercise) {
    return (
      <Screen title="Exercise" back={back}>
        <p className="px-1 text-muted">This exercise is no longer available.</p>
      </Screen>
    );
  }
  const { exercise, sessions } = data;
  const best = bestEver(sessions, exercise.unit);
  return (
    <Screen title={exercise.name} back={back}>
      <section aria-label="Summary" className={`${card} space-y-2 p-4`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">{`${exercise.muscle} · ${exercise.unit}`}</p>
          <Link to={editPath(exercise.id, from)} className={`${btnSecondary} px-5`}>
            Edit
          </Link>
        </div>
        {best && (
          <p className="font-medium">
            {`Best: ${best.session.best!.weight} × ${best.session.best!.reps}${best.session.unit !== exercise.unit ? ` ${best.session.unit}` : ''}` +
              ` · est. max ${Math.round(best.max)} ${exercise.unit} (${formatDayLabel(best.session.date)})`}
          </p>
        )}
      </section>
      {sessions.length === 0 ? (
        <p className="px-1 text-muted">No sessions yet.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s, i) => (
            <li key={`${s.workoutId}-${i}`}>
              <Link to={`/workout/${s.workoutId}`} className={`${card} flex items-start gap-3 p-4 active:bg-raised`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">{`${formatDayLabel(s.date)} · ${s.name}`}</p>
                  {s.warmups.length > 0 && <p className="text-sm text-muted">{`W ${s.warmups.map(formatHistorySet).join(' · ')}`}</p>}
                  {s.sets.length > 0 && <p className="text-sm">{setsLine(s, exercise.unit)}</p>}
                  {s.best && <p className="text-sm text-muted">{sessionBest(s)}</p>}
                </div>
                <span aria-hidden="true" className="text-xl text-faint">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
