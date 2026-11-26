import { formatNutrient, NUTRIENT_KEYS, sumNutrients, type Nutrients } from '../../domain/nutrients';
import type { TargetValues } from '../../domain/targets';
import { leftAfterText } from '../format';
import { NUTRIENT_NAMES } from '../labels';
import { card } from '../styles';

/**
 * What the amount on screen adds: calories, the label nutrients ("–" when the food has no
 * value), and what would be left of the day's targets. `nutrients` is null while the amount
 * typed is not a valid number.
 */
export function NutrientPreview({
  nutrients,
  dayTotals,
  targets,
}: {
  nutrients: Nutrients | null;
  dayTotals: Nutrients;
  targets: TargetValues | null;
}) {
  const left = nutrients ? leftAfterText(targets, sumNutrients([dayTotals, nutrients])) : null;
  return (
    <section aria-label="This amount" className={`${card} space-y-3 p-4`}>
      <p className="text-2xl font-semibold tabular-nums">{`${formatNutrient('kcal', nutrients?.kcal)} kcal`}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {NUTRIENT_KEYS.filter((key) => key !== 'kcal').map((key) => {
          const value = nutrients?.[key];
          return (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-muted">{NUTRIENT_NAMES[key]}</dt>
              <dd data-testid={`nutrient-${key}`} className="font-medium tabular-nums">
                {value === undefined ? '–' : `${formatNutrient(key, value)} g`}
              </dd>
            </div>
          );
        })}
      </dl>
      {left && <p className="border-t border-line pt-3 text-sm font-medium text-accent-soft">{left}</p>}
    </section>
  );
}
