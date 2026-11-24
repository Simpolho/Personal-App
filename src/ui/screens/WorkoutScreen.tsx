import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import type { Exercise, Workout, WorkoutEntry, WorkoutSet } from '../../db/types';
import { deleteWorkout, finishWorkout, lastSetsFor, saveWorkout, setExerciseNote } from '../../db/workouts';
import { formatElapsed, formatLast, formatTarget, parseLift, parseReps, RPE_VALUES } from '../../domain/workouts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { btnDanger, btnDone, btnSecondary, card, input } from '../styles';

/** Moves an ISO time by whole local days, keeping the time of day. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
};

/**
 * A number box that keeps what's being typed while it has focus, saves each value that parses,
 * and marks text that doesn't. Emptying it saves "no value" when the box is left.
 */
function NumberBox({
  label,
  value,
  parse,
  onValue,
  inputMode,
  className,
}: {
  label: string;
  value: number | undefined;
  parse: (text: string) => number | null;
  onValue: (value: number | undefined) => void;
  inputMode: 'decimal' | 'numeric';
  className: string;
}) {
  const shown = value === undefined ? '' : String(value);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(shown);
      setInvalid(false);
    }
  }, [shown, focused]);
  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode={inputMode}
      className={`${className} ${invalid ? 'ring-2 ring-red-500' : ''}`}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        if (text.trim() === '' && value !== undefined) onValue(undefined);
        setFocused(false);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next.trim() === '') return setInvalid(false);
        const parsed = parse(next);
        setInvalid(parsed === null);
        if (parsed !== null && parsed !== value) onValue(parsed);
      }}
    />
  );
}

function NoteBox({ exercise }: { exercise: Exercise }) {
  const [text, setText] = useState(exercise.note);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(exercise.note);
  }, [exercise.note, focused]);
  return (
    <input
      aria-label="Note"
      placeholder="Add a note"
      className="min-h-11 w-full rounded-lg bg-amber-50 px-3 text-sm text-amber-950 placeholder:text-amber-700/60 focus:outline-none focus:ring-2 focus:ring-amber-400"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (text.trim() !== exercise.note) void setExerciseNote(exercise.id, text.trim());
      }}
    />
  );
}

const UNIT_LABEL = { kg: 'kg', lb: 'lb', plates: 'pl', bodyweight: 'kg' } as const;

function SetRow({
  set,
  label,
  unit,
  onChange,
  onRemove,
}: {
  set: WorkoutSet;
  /** "Set 2" or "Warm-up 1". */
  label: string;
  unit: WorkoutEntry['unit'];
  onChange: (set: WorkoutSet) => void;
  onRemove: () => void;
}) {
  const tag = set.warmup ? `W${label.split(' ')[1]}` : label.split(' ')[1];
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={`w-7 shrink-0 text-center text-sm font-semibold ${set.warmup ? 'text-amber-700' : 'text-zinc-500'}`}>{tag}</span>
        {unit === 'bodyweight' && <span className="text-sm text-zinc-500">+</span>}
        <NumberBox
          label={`${label} weight`}
          value={set.weight}
          parse={parseLift}
          inputMode="decimal"
          className={`${input} w-20 px-2 text-center`}
          onValue={(weight) => onChange({ ...set, weight })}
        />
        <span className="w-5 shrink-0 text-sm text-zinc-500">{UNIT_LABEL[unit]}</span>
        <span className="text-zinc-400">×</span>
        <NumberBox
          label={`${label} reps`}
          value={set.reps}
          parse={parseReps}
          inputMode="numeric"
          className={`${input} w-16 px-2 text-center`}
          onValue={(reps) => onChange({ ...set, reps })}
        />
        <button
          type="button"
          aria-label={`Done ${label.toLowerCase()}`}
          aria-pressed={set.done}
          className={`ml-auto flex size-11 shrink-0 items-center justify-center rounded-xl text-xl ${
            set.done ? 'bg-emerald-600 text-white' : 'bg-white text-zinc-400 ring-1 ring-zinc-300'
          }`}
          onClick={() => onChange({ ...set, done: !set.done })}
        >
          ✓
        </button>
        <button
          type="button"
          aria-label={`Remove ${label.toLowerCase()}`}
          className="flex size-11 shrink-0 items-center justify-center text-zinc-400"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      {set.done && !set.warmup && (
        <div className="flex items-center gap-1 pl-8">
          <span className="mr-1 text-xs text-zinc-500">RPE</span>
          {RPE_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`RPE ${v} for ${label.toLowerCase()}`}
              aria-pressed={set.rpe === v}
              className={`min-h-9 min-w-9 rounded-lg text-sm font-medium ${set.rpe === v ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
              onClick={() => onChange({ ...set, rpe: set.rpe === v ? undefined : v })}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

type EntryMenu = { open: boolean; first: boolean; last: boolean; onToggle: () => void; onSwap: () => void; onMove: (by: -1 | 1) => void; onRemove: () => void };

function EntryCard({
  entry,
  exercise,
  last,
  menu,
  onChange,
}: {
  entry: WorkoutEntry;
  exercise: Exercise | undefined;
  last: WorkoutSet[] | null | undefined;
  menu: EntryMenu;
  onChange: (entry: WorkoutEntry) => void;
}) {
  const name = exercise?.name ?? 'Exercise';
  const labels = entry.sets.map((s, i) => {
    const n = entry.sets.slice(0, i + 1).filter((x) => x.warmup === s.warmup).length;
    return s.warmup ? `Warm-up ${n}` : `Set ${n}`;
  });
  const setAt = (i: number, next: WorkoutSet) => onChange({ ...entry, sets: entry.sets.map((s, j) => (j === i ? next : s)) });
  const addSet = () => {
    const from = [...entry.sets].reverse().find((s) => !s.warmup);
    onChange({ ...entry, sets: [...entry.sets, { id: crypto.randomUUID(), warmup: false, done: false, weight: from?.weight, reps: from?.reps }] });
  };
  const addWarmup = () => {
    const at = entry.sets.filter((s) => s.warmup).length;
    const sets = [...entry.sets];
    sets.splice(at, 0, { id: crypto.randomUUID(), warmup: true, done: false });
    onChange({ ...entry, sets });
  };
  return (
    <section aria-label={name} className={`${card} space-y-2 p-3`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{name}</h2>
          {entry.target && <p className="text-sm text-zinc-600">{formatTarget(entry.target)}</p>}
          {last && last.length > 0 && <p className="text-sm text-zinc-500">{`Last: ${formatLast(last)}`}</p>}
        </div>
        <button
          type="button"
          aria-label={`Options for ${name}`}
          aria-expanded={menu.open}
          className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-zinc-500"
          onClick={menu.onToggle}
        >
          ⋯
        </button>
      </div>
      {menu.open && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btnSecondary} onClick={menu.onSwap}>
            Swap
          </button>
          <button type="button" className={btnDanger} onClick={menu.onRemove}>
            Remove
          </button>
          <button type="button" className={btnSecondary} disabled={menu.first} onClick={() => menu.onMove(-1)}>
            Move up
          </button>
          <button type="button" className={btnSecondary} disabled={menu.last} onClick={() => menu.onMove(1)}>
            Move down
          </button>
        </div>
      )}
      {exercise && <NoteBox exercise={exercise} />}
      <ul className="space-y-1.5">
        {entry.sets.map((s, i) => (
          <SetRow
            key={s.id}
            set={s}
            label={labels[i]!}
            unit={entry.unit}
            onChange={(next) => setAt(i, next)}
            onRemove={() => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) })}
          />
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btnSecondary} onClick={addSet}>
          + Set
        </button>
        <button type="button" className={btnSecondary} onClick={addWarmup}>
          + Warm-up
        </button>
      </div>
    </section>
  );
}

/**
 * Logging a workout, and correcting a finished one. The screen keeps its own copy of the workout
 * and saves every change in order, so quick taps never overwrite each other.
 */
export function WorkoutScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  const latest = useRef<Workout | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const [dialog, setDialog] = useState<'discard' | 'delete' | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<WorkoutEntry | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    void db.workouts.get(id).then((w) => {
      if (cancelled) return;
      const found = w && isLive(w) ? w : null;
      latest.current = found;
      setWorkout(found);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const inProgress = workout ? workout.finishedAt === undefined : false;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

  const exercises = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), []);
  const idsKey = workout ? [...new Set(workout.entries.map((e) => e.exerciseId))].join(',') : '';
  const last = useLiveQuery(async () => {
    if (!workout) return new Map<string, WorkoutSet[] | null>();
    const ids = idsKey ? idsKey.split(',') : [];
    const found = await Promise.all(ids.map(async (e) => [e, await lastSetsFor(e, workout.startedAt, workout.id)] as const));
    return new Map(found);
    // Last time only changes with the exercises in the workout and when it started.
  }, [idsKey, workout?.startedAt, workout?.id]);

  function update(change: (w: Workout) => Workout) {
    const current = latest.current;
    if (!current) return;
    const next = change(current);
    latest.current = next;
    setWorkout(next);
    saving.current = saving.current.then(() => saveWorkout(next)).catch((error: unknown) => console.error('Could not save the workout', error));
  }

  async function finish() {
    const w = latest.current;
    if (!w) return;
    if (!w.entries.some((e) => e.sets.some((s) => s.done))) return setDialog('discard');
    await saving.current;
    await finishWorkout(w.id);
    navigate(`/workout/${w.id}/recap`, { replace: true });
  }

  /** Leaves for another screen once every change is saved, so that screen reads the latest workout. */
  async function go(path: string) {
    await saving.current;
    navigate(path);
  }

  function move(entryId: string, by: -1 | 1) {
    update((w) => {
      const i = w.entries.findIndex((e) => e.id === entryId);
      const j = i + by;
      if (i < 0 || j < 0 || j >= w.entries.length) return w;
      const entries = [...w.entries];
      [entries[i], entries[j]] = [entries[j]!, entries[i]!];
      return { ...w, entries };
    });
  }

  async function remove() {
    const w = latest.current;
    if (!w) return;
    await saving.current;
    await deleteWorkout(w.id);
    navigate('/workouts', { replace: true });
  }

  if (workout === undefined) return <Screen title="" back="/workouts" />;
  if (workout === null) {
    return (
      <Screen title="Not found" back="/workouts">
        <p className="text-zinc-600">This workout is no longer available.</p>
      </Screen>
    );
  }

  return (
    <Screen
      title={workout.name}
      back="/workouts"
      footer={
        inProgress ? (
          <div className="flex items-center gap-3">
            <span aria-label="Elapsed time" className="flex-1 text-lg font-semibold tabular-nums text-zinc-700">
              {formatElapsed(workout.startedAt, now)}
            </span>
            <button type="button" className={`${btnDone} px-8`} onClick={() => void finish()}>
              Finish
            </button>
          </div>
        ) : undefined
      }
    >
      {workout.entries.map((entry, i) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          exercise={exercises?.get(entry.exerciseId)}
          last={last?.get(entry.exerciseId)}
          menu={{
            open: menuFor === entry.id,
            first: i === 0,
            last: i === workout.entries.length - 1,
            onToggle: () => setMenuFor(menuFor === entry.id ? null : entry.id),
            onSwap: () => void go(`/workout/${workout.id}/swap/${entry.id}`),
            onMove: (by) => move(entry.id, by),
            onRemove: () => setRemoving(entry),
          }}
          onChange={(next) => update((w) => ({ ...w, entries: w.entries.map((e) => (e.id === next.id ? next : e)) }))}
        />
      ))}
      <button type="button" className={`${btnSecondary} w-full`} onClick={() => void go(`/workout/${workout.id}/add`)}>
        + Add exercise
      </button>

      {!inProgress && (
        <section className={`${card} space-y-3 p-4`}>
          <Field label="Date">
            <input
              type="date"
              className={`${input} block min-w-0 appearance-none`}
              value={workout.date}
              onChange={(e) => {
                const date = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
                update((w) => {
                  const days = dayNumber(date) - dayNumber(w.date);
                  return {
                    ...w,
                    date,
                    startedAt: shiftDays(w.startedAt, days),
                    ...(w.finishedAt ? { finishedAt: shiftDays(w.finishedAt, days) } : {}),
                  };
                });
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Link to={`/workout/${workout.id}/recap`} className={btnSecondary}>
              Recap
            </Link>
            <button type="button" className={btnDanger} onClick={() => setDialog('delete')}>
              Delete workout
            </button>
          </div>
        </section>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${exercises?.get(removing.exerciseId)?.name ?? 'this exercise'} from this workout?`}
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const gone = removing.id;
            update((w) => ({ ...w, entries: w.entries.filter((e) => e.id !== gone) }));
            setRemoving(null);
            setMenuFor(null);
          }}
        />
      )}
      {dialog === 'discard' && (
        <ConfirmDialog
          title="Nothing is ticked"
          message="Discard this workout?"
          confirmLabel="Discard workout"
          onCancel={() => setDialog(null)}
          onConfirm={() => void remove()}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog title={`Delete ${workout.name}?`} confirmLabel="Delete" onCancel={() => setDialog(null)} onConfirm={() => void remove()} />
      )}
    </Screen>
  );
}
