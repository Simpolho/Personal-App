import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import type { Exercise, Workout, WorkoutEntry, WorkoutSet } from '../../db/types';
import { deleteWorkout, lastSetsFor, saveWorkout, setExerciseNote } from '../../db/workouts';
import { nowIso } from '../../domain/dates';
import { finishedVersion, formatElapsed, formatLast, formatTarget, parseLift, parseReps, RPE_VALUES } from '../../domain/workouts';
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
      className={`${className} ${invalid ? 'ring-2 ring-danger focus:ring-danger' : ''}`}
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
        // "22," is a number still being typed, not a wrong one.
        if (/^\d+[.,]$/.test(next.trim())) return setInvalid(false);
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
      className="min-h-11 w-full rounded-lg bg-warn/10 px-3 text-sm text-warn placeholder:text-warn/50 focus:outline-none focus:ring-2 focus:ring-warn"
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

/** A weight or reps box in a set row: its own width (the shared input class is full width). */
const setBox =
  'min-h-11 min-w-0 shrink rounded-xl border-0 bg-raised px-1 text-center text-base text-fg ring-1 ring-line-strong focus:outline-none focus:ring-2 focus:ring-accent';

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
        <span className={`w-7 shrink-0 text-center text-sm font-semibold ${set.warmup ? 'text-warn' : 'text-muted'}`}>{tag}</span>
        {unit === 'bodyweight' && <span className="text-sm text-muted">+</span>}
        <NumberBox
          label={`${label} weight`}
          value={set.weight}
          parse={parseLift}
          inputMode="decimal"
          className={`${setBox} w-[4.25rem]`}
          onValue={(weight) => onChange({ ...set, weight })}
        />
        <span className="w-5 shrink-0 text-sm text-muted">{UNIT_LABEL[unit]}</span>
        <span className="text-faint">×</span>
        <NumberBox
          label={`${label} reps`}
          value={set.reps}
          parse={parseReps}
          inputMode="numeric"
          className={`${setBox} w-14`}
          onValue={(reps) => onChange({ ...set, reps })}
        />
        <button
          type="button"
          aria-label={`Done ${label.toLowerCase()}`}
          aria-pressed={set.done}
          className={`ml-auto flex size-11 shrink-0 items-center justify-center rounded-xl text-xl ${
            set.done ? 'bg-accent text-on-accent' : 'bg-raised text-faint'
          }`}
          onClick={() => onChange({ ...set, done: !set.done })}
        >
          ✓
        </button>
        <button
          type="button"
          aria-label={`Remove ${label.toLowerCase()}`}
          className="flex size-11 shrink-0 items-center justify-center text-faint"
          onClick={onRemove}
        >
          ✕
        </button>
      </div>
      {set.done && !set.warmup && (
        <div className="flex items-center gap-1.5 pl-8">
          <span className="mr-1 text-xs text-muted">RPE</span>
          {RPE_VALUES.map((v) => (
            <button
              key={v}
              type="button"
              aria-label={`RPE ${v} for ${label.toLowerCase()}`}
              aria-pressed={set.rpe === v}
              className={`min-h-11 min-w-11 rounded-lg text-sm font-medium ${set.rpe === v ? 'bg-accent text-on-accent' : 'bg-raised text-fg'}`}
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
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const removeAt = (i: number) => onChange({ ...entry, sets: entry.sets.filter((_, j) => j !== i) });
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
          {entry.target && <p className="text-sm text-muted">{formatTarget(entry.target)}</p>}
          {last && last.length > 0 && <p className="text-sm text-muted">{`Last: ${formatLast(last)}`}</p>}
        </div>
        <button
          type="button"
          aria-label={`Options for ${name}`}
          aria-expanded={menu.open}
          className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-muted"
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
            onRemove={() => (s.done ? setConfirmRemove(i) : removeAt(i))}
          />
        ))}
      </ul>
      {confirmRemove !== null && (
        <ConfirmDialog
          title={`Remove ${labels[confirmRemove]?.toLowerCase() ?? 'this set'} of ${name}?`}
          message="It's ticked as done."
          confirmLabel="Remove"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            removeAt(confirmRemove);
            setConfirmRemove(null);
          }}
        />
      )}
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
  const failed = useRef(false);
  const finishing = useRef(false);
  const [unsaved, setUnsaved] = useState(false);
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
  // Looked up when the workout's exercises (or its start) change, not on every tap: it reads
  // every past workout with each exercise.
  const [last, setLast] = useState<Map<string, WorkoutSet[] | null>>(new Map());
  const unitsKey = workout ? workout.entries.map((e) => `${e.exerciseId}:${e.unit}`).join(',') : '';
  const startedAt = workout?.startedAt;
  useEffect(() => {
    if (!startedAt || !unitsKey) return;
    let cancelled = false;
    void Promise.all(
      [...new Set(unitsKey.split(','))].map(async (key) => {
        const [exerciseId, unit] = key.split(':') as [string, WorkoutEntry['unit']];
        return [exerciseId, await lastSetsFor(exerciseId, startedAt, id, unit)] as const;
      }),
    ).then((found) => {
      if (!cancelled) setLast(new Map(found));
    });
    return () => {
      cancelled = true;
    };
  }, [unitsKey, startedAt, id]);

  /** Saves a copy of the workout after the saves before it. A failure is shown, and kept for Retry. */
  function enqueue(copy: Workout) {
    saving.current = saving.current
      .then(() => saveWorkout(copy))
      .then(
        () => {
          failed.current = false;
          setUnsaved(false);
        },
        (error: unknown) => {
          console.error('Could not save the workout', error);
          failed.current = true;
          setUnsaved(true);
        },
      );
  }

  function update(change: (w: Workout) => Workout) {
    const current = latest.current;
    if (!current || finishing.current) return;
    const next = change(current);
    latest.current = next;
    setWorkout(next);
    enqueue(next);
  }

  function retry() {
    if (latest.current) enqueue(latest.current);
  }

  // Coming back to the app retries a save that failed (iOS can close the database while locked).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'hidden' && failed.current) retry();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function finish() {
    const w = latest.current;
    if (!w || finishing.current) return;
    // Logged afterwards (started well before it was created): its length isn't known.
    const loggedAfter = new Date(w.createdAt).getTime() - new Date(w.startedAt).getTime() > 60 * 60_000;
    const finished = finishedVersion(w, loggedAfter ? w.startedAt : nowIso());
    if (!finished) return setDialog('discard');
    // From the screen's own copy, through the same queue, so a save that failed earlier can't lose sets.
    finishing.current = true;
    enqueue(finished);
    await saving.current;
    if (failed.current) {
      finishing.current = false;
      return;
    }
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
        <p className="text-muted">This workout is no longer available.</p>
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
            <span aria-label="Elapsed time" className="flex-1 text-lg font-semibold tabular-nums text-fg">
              {formatElapsed(workout.startedAt, now)}
            </span>
            <button type="button" className={`${btnDone} px-8`} onClick={() => void finish()}>
              Finish
            </button>
          </div>
        ) : undefined
      }
    >
      {unsaved && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-danger/15 p-3 text-sm text-danger ring-1 ring-danger/30">
          <span>
            <strong>Not saved</strong>
            <span className="block">Your last change couldn't be saved.</span>
          </span>
          <button type="button" className={btnSecondary} onClick={retry}>
            Retry
          </button>
        </div>
      )}
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
