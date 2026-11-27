import type { EntryUnit, ExerciseUnit } from '../../db/types';
import { WEIGHT_UNITS } from '../../domain/workouts';

/** kg or lb for one exercise in a workout. An old plates entry shows neither as chosen. */
export function UnitSwitch({ unit, onChange }: { unit: EntryUnit; onChange: (unit: ExerciseUnit) => void }) {
  return (
    <div role="radiogroup" aria-label="Unit" className="grid grid-cols-2 gap-1 rounded-xl bg-page p-1 ring-1 ring-line">
      {WEIGHT_UNITS.map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={unit === u}
          className={`min-h-11 rounded-lg text-sm font-medium ${unit === u ? 'bg-accent text-on-accent' : 'text-muted'}`}
          onClick={() => onChange(u)}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
