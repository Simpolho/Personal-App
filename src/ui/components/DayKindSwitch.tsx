import type { DayKind } from '../../db/types';

const OPTIONS: { kind: DayKind; label: string }[] = [
  { kind: 'training', label: 'Training day' },
  { kind: 'rest', label: 'Rest day' },
];

/** Picks which targets the day uses. */
export function DayKindSwitch({ kind, onChange }: { kind: DayKind; onChange: (kind: DayKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Kind of day" className="grid grid-cols-2 gap-1 rounded-xl bg-page p-1 ring-1 ring-line">
      {OPTIONS.map((o) => (
        <button
          key={o.kind}
          type="button"
          role="radio"
          aria-checked={kind === o.kind}
          className={`min-h-11 rounded-lg text-sm font-medium ${kind === o.kind ? 'bg-accent text-on-accent' : 'text-muted'}`}
          onClick={() => onChange(o.kind)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
