import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { isLive } from '../../db/records';
import type { Exercise, MuscleGroup, WeightUnit } from '../../db/types';
import { deleteExercise, listExercises, saveExercise } from '../../db/workouts';
import { MUSCLE_GROUPS, parseLift, WEIGHT_UNITS } from '../../domain/workouts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { WEIGHT_UNIT_NAMES } from '../labels';
import { btnDanger, btnPrimary, card, errorText, input, select } from '../styles';

const BACK = '/workouts/routines';

function ExerciseForm({ existing }: { existing: Exercise | null }) {
  const navigate = useNavigate();
  const [name, setName] = useState(existing?.name ?? '');
  const [muscle, setMuscle] = useState<MuscleGroup | ''>(existing?.muscle ?? '');
  const [unit, setUnit] = useState<WeightUnit>(existing?.unit ?? 'kg');
  const [plateValue, setPlateValue] = useState(existing?.plateWeight ? String(existing.plateWeight.value) : '');
  const [plateUnit, setPlateUnit] = useState<'kg' | 'lb'>(existing?.plateWeight?.unit ?? 'kg');
  const [eachSide, setEachSide] = useState(existing?.eachSide ?? false);
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name');
    if (!muscle) return setError('Choose a muscle group');
    const fold = (s: string) => s.trim().toLowerCase();
    if ((await listExercises()).some((e) => e.id !== existing?.id && fold(e.name) === fold(trimmed))) {
      return setError(`There's already an exercise called ${trimmed}`);
    }
    // Kept even when the unit isn't plates any more, so sets logged in plates still count.
    let plateWeight: Exercise['plateWeight'];
    if (plateValue.trim() !== '') {
      const value = parseLift(plateValue);
      if (value === null || value === 0) {
        if (unit === 'plates') return setError('Enter what one plate weighs, or leave it empty');
      } else plateWeight = { value, unit: plateUnit };
    }
    await saveExercise({ name: trimmed, muscle, unit, ...(plateWeight ? { plateWeight } : {}), eachSide, note: note.trim() }, existing?.id);
    navigate(BACK);
  }

  async function remove() {
    if (!existing) return;
    setConfirming(false);
    const { usedIn } = await deleteExercise(existing.id);
    if (usedIn.length > 0) return setError(`Used in ${usedIn.join(', ')} — remove it there first`);
    navigate(BACK);
  }

  return (
    <Screen title={existing ? existing.name : 'New exercise'} back={BACK}>
      <section className={`${card} space-y-3 p-4`}>
        <Field label="Name">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Muscle group">
            <select className={select} value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
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
            <select className={select} value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
              {WEIGHT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {WEIGHT_UNIT_NAMES[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {unit === 'plates' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 plate =">
              <input className={input} inputMode="decimal" value={plateValue} placeholder="Not set" onChange={(e) => setPlateValue(e.target.value)} />
            </Field>
            <Field label="Plate unit">
              <select className={select} value={plateUnit} onChange={(e) => setPlateUnit(e.target.value as 'kg' | 'lb')}>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </Field>
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5 accent-accent" checked={eachSide} onChange={(e) => setEachSide(e.target.checked)} />
          <span>Each side</span>
        </label>
        <Field label="Note">
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
          Save
        </button>
      </section>
      {existing && (
        <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirming(true)}>
          Delete
        </button>
      )}
      {confirming && existing && (
        <ConfirmDialog title={`Delete ${existing.name}?`} confirmLabel="Delete" onCancel={() => setConfirming(false)} onConfirm={() => void remove()} />
      )}
    </Screen>
  );
}

/** Edits an exercise: name, muscle group, unit, plate weight, each side and note. */
export function ExerciseEditorScreen() {
  const { id = 'new' } = useParams();
  const [loaded, setLoaded] = useState<{ id: string; existing: Exercise | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = id === 'new' ? undefined : await db.exercises.get(id);
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
        <p className="text-muted">This exercise is no longer available.</p>
      </Screen>
    );
  }
  return <ExerciseForm key={id} existing={loaded.existing} />;
}
