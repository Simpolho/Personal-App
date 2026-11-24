import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import type { MuscleGroup, WeightUnit } from '../../db/types';
import { listExercises, newEntry, saveExercise, saveWorkout } from '../../db/workouts';
import { MUSCLE_GROUPS, WEIGHT_UNITS } from '../../domain/workouts';
import { Field, Screen } from '../components/ui';
import { WEIGHT_UNIT_NAMES } from '../labels';
import { btnPrimary, card, errorText, input, row, sectionTitle } from '../styles';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Picks an exercise to add to a workout, or to swap one for; can create a new exercise on the spot. */
export function ExercisePickerScreen() {
  const { id = '', entryId } = useParams();
  const navigate = useNavigate();
  const workout = useLiveQuery(() => db.workouts.get(id), [id]);
  const exercises = useLiveQuery(() => listExercises(), []);
  const [search, setSearch] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<MuscleGroup | ''>('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [error, setError] = useState<string | null>(null);
  const back = `/workout/${id}`;

  const swapping = entryId ? workout?.entries.find((e) => e.id === entryId) : undefined;
  const swappingName = swapping ? exercises?.find((e) => e.id === swapping.exerciseId)?.name : undefined;
  const matches = (exercises ?? []).filter((e) => fold(e.name).includes(fold(search)));
  const newName = name ?? search;

  async function pick(exerciseId: string) {
    const w = await db.workouts.get(id);
    if (!w) return;
    if (entryId) {
      const old = w.entries.find((e) => e.id === entryId);
      if (!old) return navigate(back, { replace: true });
      const count = old.target?.sets ?? Math.max(1, old.sets.filter((s) => !s.warmup).length);
      const entry = await newEntry(exerciseId, w.startedAt, count);
      const replaced = old.target ? { ...entry, target: old.target } : entry;
      await saveWorkout({ ...w, entries: w.entries.map((e) => (e.id === entryId ? replaced : e)) });
    } else {
      await saveWorkout({ ...w, entries: [...w.entries, await newEntry(exerciseId, w.startedAt)] });
    }
    navigate(back, { replace: true });
  }

  async function create() {
    const trimmed = newName.trim();
    if (!trimmed) return setError('Enter a name');
    if (!muscle) return setError('Choose a muscle group');
    if ((exercises ?? []).some((e) => fold(e.name) === fold(trimmed))) return setError(`There's already an exercise called ${trimmed}`);
    const made = await saveExercise({ name: trimmed, muscle, unit, eachSide: false, note: '' });
    await pick(made.id);
  }

  return (
    <Screen title={entryId ? `Swap ${swappingName ?? ''}`.trim() : 'Add exercise'} back={back}>
      <input
        aria-label="Search exercises"
        placeholder="Search exercises"
        className={input}
        value={search}
        autoFocus
        onChange={(e) => {
          setSearch(e.target.value);
          setError(null);
        }}
      />
      {matches.length > 0 && (
        <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
          {matches.map((e) => (
            <li key={e.id}>
              <button type="button" aria-label={e.name} className={row} onClick={() => void pick(e.id)}>
                <span className="font-medium">{e.name}</span>
                <span className="text-sm text-zinc-500">{e.muscle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <section className="space-y-2">
        <h2 className={sectionTitle}>New exercise</h2>
        <div className={`${card} space-y-3 p-4`}>
          <Field label="Name">
            <input
              className={input}
              value={newName}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Muscle group">
              <select className={input} value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
                <option value="" disabled>
                  Choose
                </option>
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit">
              <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {WEIGHT_UNIT_NAMES[u]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => void create()}>
            Create and add
          </button>
        </div>
      </section>
    </Screen>
  );
}
