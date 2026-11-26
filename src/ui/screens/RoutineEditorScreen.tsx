import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import type { Routine, RoutineItem } from '../../db/types';
import { deleteRoutine, listExercises, saveRoutine } from '../../db/workouts';
import { parseLift, parseReps } from '../../domain/workouts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { btnDanger, btnPrimary, btnSecondary, card, errorText, input, sectionTitle } from '../styles';

const BACK = '/workouts/routines';
/** Checkbox order Mon … Sun, with JavaScript's day numbers (0 = Sunday). */
const DAYS: [string, number][] = [
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
  ['Sun', 0],
];

type ItemDraft = { key: string; exerciseId: string; sets: string; repsMin: string; repsMax: string; rpeTarget: string; startWeight: string };

const toDraft = (i: RoutineItem): ItemDraft => ({
  key: crypto.randomUUID(),
  exerciseId: i.exerciseId,
  sets: String(i.sets),
  repsMin: String(i.repsMin),
  repsMax: String(i.repsMax),
  rpeTarget: i.rpeTarget,
  startWeight: i.startWeight === undefined ? '' : String(i.startWeight),
});

function RoutineForm({ existing }: { existing: Routine | null }) {
  const navigate = useNavigate();
  const exercises = useLiveQuery(() => listExercises(), []);
  const [name, setName] = useState(existing?.name ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? []);
  const [items, setItems] = useState<ItemDraft[]>(() => (existing?.items ?? []).map(toDraft));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const nameOf = (exerciseId: string) => exercises?.find((e) => e.id === exerciseId)?.name ?? 'Exercise';

  const change = (key: string, patch: Partial<ItemDraft>) => {
    setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setError(null);
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    setItems(next);
  };

  async function save() {
    if (!name.trim()) return setError('Enter a name');
    const out: RoutineItem[] = [];
    for (const i of items) {
      const label = nameOf(i.exerciseId);
      const sets = parseReps(i.sets);
      if (sets === null || sets > 20) return setError(`${label}: sets must be a whole number from 1 to 20`);
      const repsMin = parseReps(i.repsMin);
      const repsMax = parseReps(i.repsMax);
      if (repsMin === null || repsMax === null) return setError(`${label}: enter reps from and to`);
      if (repsMin > repsMax) return setError(`${label}: reps from can't be more than reps to`);
      const startWeight = i.startWeight.trim() === '' ? undefined : parseLift(i.startWeight);
      if (startWeight === null) return setError(`${label}: the starting weight isn't a number`);
      out.push({ exerciseId: i.exerciseId, sets, repsMin, repsMax, rpeTarget: i.rpeTarget.trim(), ...(startWeight === undefined ? {} : { startWeight }) });
    }
    await saveRoutine({ name: name.trim(), weekdays: [...weekdays].sort((a, b) => a - b), items: out }, existing?.id);
    navigate(BACK);
  }

  return (
    <Screen title={existing ? existing.name : 'New routine'} back={BACK}>
      <section className={`${card} space-y-3 p-4`}>
        <Field label="Name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">Planned on</legend>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(([label, day]) => (
              <label key={label} className="flex min-h-11 flex-col items-center justify-center gap-1 text-sm">
                <input
                  type="checkbox"
                  aria-label={label}
                  className="size-5 accent-accent"
                  checked={weekdays.includes(day)}
                  onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, day] : weekdays.filter((d) => d !== day))}
                />
                <span aria-hidden="true">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-2">
        <h2 className={sectionTitle}>Exercises</h2>
        {items.map((i, index) => (
          <section key={i.key} aria-label={nameOf(i.exerciseId)} className={`${card} space-y-3 p-4`}>
            <h3 className="font-semibold">{nameOf(i.exerciseId)}</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Sets">
                <input className={input} inputMode="numeric" value={i.sets} onChange={(e) => change(i.key, { sets: e.target.value })} />
              </Field>
              <Field label="Reps from">
                <input className={input} inputMode="numeric" value={i.repsMin} onChange={(e) => change(i.key, { repsMin: e.target.value })} />
              </Field>
              <Field label="Reps to">
                <input className={input} inputMode="numeric" value={i.repsMax} onChange={(e) => change(i.key, { repsMax: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="RPE target">
                <input className={input} value={i.rpeTarget} placeholder="e.g. 7–8" onChange={(e) => change(i.key, { rpeTarget: e.target.value })} />
              </Field>
              <Field label="Starting weight">
                <input
                  className={input}
                  inputMode="decimal"
                  value={i.startWeight}
                  placeholder="Optional"
                  onChange={(e) => change(i.key, { startWeight: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={btnSecondary} disabled={index === 0} onClick={() => move(index, -1)}>
                Move up
              </button>
              <button type="button" className={btnSecondary} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                Move down
              </button>
              <button type="button" className={btnDanger} onClick={() => setItems(items.filter((x) => x.key !== i.key))}>
                Remove
              </button>
            </div>
          </section>
        ))}
        <Field label="Add exercise">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const exerciseId = e.target.value;
              if (!exerciseId) return;
              setItems([...items, { key: crypto.randomUUID(), exerciseId, sets: '3', repsMin: '8', repsMax: '12', rpeTarget: '', startWeight: '' }]);
            }}
          >
            <option value="">Choose an exercise</option>
            {(exercises ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
        Save
      </button>
      {existing && (
        <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirming(true)}>
          Delete routine
        </button>
      )}
      {confirming && existing && (
        <ConfirmDialog
          title={`Delete ${existing.name}?`}
          message="Past workouts stay in your history."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void deleteRoutine(existing.id).then(() => navigate(BACK))}
        />
      )}
    </Screen>
  );
}

/** Edits a routine: name, weekdays, and its exercises with sets, reps, RPE target and starting weight. */
export function RoutineEditorScreen() {
  const { id = 'new' } = useParams();
  const [loaded, setLoaded] = useState<{ id: string; existing: Routine | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = id === 'new' ? undefined : await db.routines.get(id);
      if (!cancelled) setLoaded({ id, existing: found && isLive(found) ? found : null });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (loaded?.id !== id) return <Screen title="" back={BACK} />;
  if (id !== 'new' && !loaded.existing) {
    return (
      <Screen title="Not found" back={BACK}>
        <p className="text-muted">This routine is no longer available.</p>
      </Screen>
    );
  }
  return <RoutineForm key={id} existing={loaded.existing} />;
}
