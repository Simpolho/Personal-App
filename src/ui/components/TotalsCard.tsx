import type { DayKind } from '../../db/types';
import { formatNutrient, type Nutrients } from '../../domain/nutrients';
import type { TargetKey, TargetValues } from '../../domain/targets';
import { formatWhole } from '../format';
import { card } from '../styles';
import { DayKindSwitch } from './DayKindSwitch';

const MACROS: { key: Exclude<TargetKey, 'kcal'>; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
];

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const over = value > max;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className="h-2 overflow-hidden rounded-full bg-raised"
    >
      <div
        className={`h-full rounded-full ${over ? 'bg-warn' : 'bg-accent'}`}
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

/**
 * The day's calories and macros. Bars and "x / y" appear only for the targets that are set.
 * With `kind` and `onKindChange`, the Training day / Rest day switch sits at the top.
 */
export function TotalsCard({
  totals,
  targets,
  loading = false,
  kind,
  onKindChange,
}: {
  totals: Nutrients;
  targets: TargetValues | null;
  loading?: boolean;
  kind?: DayKind;
  onKindChange?: (kind: DayKind) => void;
}) {
  const kcal = totals.kcal ?? 0;
  const kcalTarget = targets?.kcal;
  return (
    <section aria-label="Totals" aria-busy={loading} className={`${card} space-y-3 p-4`}>
      {kind && onKindChange && <DayKindSwitch kind={kind} onChange={onKindChange} />}
      <div className="space-y-2">
        <p className="text-2xl font-semibold tabular-nums">
          {kcalTarget !== undefined
            ? `${formatNutrient('kcal', kcal)} / ${formatNutrient('kcal', kcalTarget)} kcal`
            : `${formatNutrient('kcal', kcal)} kcal`}
        </p>
        {kcalTarget !== undefined && <Bar label="Calories" value={kcal} max={kcalTarget} />}
      </div>
      <dl className="space-y-2">
        {MACROS.map(({ key, label }) => {
          const value = totals[key] ?? 0;
          const target = targets?.[key];
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">
                  {target !== undefined
                    ? `${formatWhole(value)} / ${formatWhole(target)} g`
                    : `${formatWhole(value)} g`}
                </dd>
              </div>
              {target !== undefined && <Bar label={label} value={value} max={target} />}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
