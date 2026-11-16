import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../db/db';
import { quickAdd, updateQuickAdd } from '../../db/log';
import type { LogEntry } from '../../db/types';
import { parseAmount, type Nutrients } from '../../domain/nutrients';
import { TARGET_KEYS, type TargetKey } from '../../domain/targets';
import { Field, Screen } from '../components/ui';
import { formatNumber } from '../format';
import { NUTRIENT_LABELS } from '../labels';
import { btnPrimary, errorText, input } from '../styles';

type Values = Record<TargetKey, string>;

function QuickForm({ mealId, entry }: { mealId: string; entry: LogEntry | null }) {
  const navigate = useNavigate();
  const [name, setName] = useState(entry && entry.nameSnapshot !== 'Quick add' ? entry.nameSnapshot : '');
  const [values, setValues] = useState<Values>(() => {
    const start = {} as Values;
    for (const key of TARGET_KEYS) {
      const value = entry?.nutrientsSnapshot[key];
      start[key] = value === undefined ? '' : formatNumber(value);
    }
    return start;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const nutrients: Nutrients = {};
    for (const key of TARGET_KEYS) {
      if (values[key].trim() === '') continue;
      const value = parseAmount(values[key], { allowZero: true });
      if (value === null) {
        setError(`${NUTRIENT_LABELS[key]}: enter a number`);
        return;
      }
      nutrients[key] = value;
    }
    if (Object.keys(nutrients).length === 0) {
      setError('Enter calories or a macro');
      return;
    }
    setBusy(true);
    if (entry) await updateQuickAdd(entry.id, name, nutrients);
    else await quickAdd(mealId, name, nutrients);
    navigate(`/meal/${mealId}`);
  }

  return (
    <Screen title="Quick add" back={entry ? `/meal/${mealId}` : `/meal/${mealId}/add`}>
      <Field label="Name (optional)">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {TARGET_KEYS.map((key) => (
          <Field key={key} label={NUTRIENT_LABELS[key]}>
            <input
              className={input}
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => {
                setValues({ ...values, [key]: e.target.value });
                setError('');
              }}
            />
          </Field>
        ))}
      </div>
      {error && <p role="alert" className={errorText}>{error}</p>}
      <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void save()}>
        {entry ? 'Save' : 'Add'}
      </button>
    </Screen>
  );
}

export function QuickAddScreen() {
  const { mealId = '' } = useParams();
  const [params] = useSearchParams();
  const entryId = params.get('entry');
  const entry = useLiveQuery(async () => {
    if (!entryId) return null;
    const found = await db.logEntries.get(entryId);
    return found && !found.deletedAt && found.unit === 'quick' ? found : null;
  }, [entryId]);

  if (entry === undefined) return <Screen title="Quick add" back={`/meal/${mealId}`} />;
  return <QuickForm key={entry?.id ?? 'new'} mealId={mealId} entry={entry} />;
}
