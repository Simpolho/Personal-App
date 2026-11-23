import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { deleteWeight, listWeights, logWeight } from '../../db/weight';
import type { WeightEntry } from '../../db/types';
import { addDays, formatDayLabel, localDate } from '../../domain/dates';
import { formatKg, parseWeight } from '../../domain/weight';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { WeightChart } from '../components/WeightChart';
import { btnDanger, btnPrimary, btnSecondary, card, errorText, input, sectionTitle } from '../styles';

function WeightForm({ start, today }: { start: { date: string; kg: string }; today: string }) {
  const [date, setDate] = useState(start.date);
  const [kg, setKg] = useState(start.kg);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const value = parseWeight(kg);
    if (value === null) return setNote({ ok: false, text: 'Enter a weight between 20 and 300 kg, with up to 2 decimals' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setNote({ ok: false, text: 'Pick a date' });
    if (date > today) return setNote({ ok: false, text: "The date can't be in the future" });
    await logWeight(date, value);
    setNote({ ok: true, text: `Saved ${formatKg(value)} kg for ${formatDayLabel(date)}.` });
  }

  return (
    <section className={`${card} space-y-3 p-4`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)">
          <input
            className={input}
            inputMode="decimal"
            value={kg}
            onChange={(e) => {
              setKg(e.target.value);
              setNote(null);
            }}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={`${input} block min-w-0 appearance-none`}
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value);
              setNote(null);
            }}
          />
        </Field>
      </div>
      {note && <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm font-medium text-emerald-800' : errorText}>{note.text}</p>}
      <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
        Save weight
      </button>
    </section>
  );
}

export function WeightScreen() {
  const today = localDate(new Date());
  const weights = useLiveQuery(() => listWeights(), []);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [deleting, setDeleting] = useState<WeightEntry | null>(null);

  if (weights === undefined) return <Screen title="Weight" back="/" />;

  const last = weights.at(-1);
  const start = editing
    ? { date: editing.date, kg: formatKg(editing.kg) }
    : { date: today, kg: last ? formatKg(last.kg) : '' };
  const recent = weights.some((w) => w.date >= addDays(today, -29) && w.date <= today);

  return (
    <Screen title="Weight" back="/">
      <WeightForm key={editing ? `edit-${editing.date}-${editing.updatedAt}` : 'new'} start={start} today={today} />

      {recent && (
        <section className={`${card} p-3`}>
          <WeightChart weights={weights} endDate={today} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className={sectionTitle}>History</h2>
        {weights.length === 0 ? (
          <p className="px-1 text-zinc-500">No weighings yet</p>
        ) : (
          <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
            {[...weights].reverse().map((w) => {
              const label = formatDayLabel(w.date);
              return (
                <li key={w.date} className="flex items-center justify-between gap-2 py-2 pr-2 pl-4">
                  <span className="whitespace-nowrap tabular-nums">{`${label} · ${formatKg(w.kg)} kg`}</span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${label}`} className={`${btnSecondary} px-3 text-sm`} onClick={() => setEditing(w)}>
                      Edit
                    </button>
                    <button type="button" aria-label={`Delete ${label}`} className={`${btnDanger} px-3 text-sm`} onClick={() => setDeleting(w)}>
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Delete the weight for ${formatDayLabel(deleting.date)}?`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void deleteWeight(deleting.date);
            if (editing?.date === deleting.date) setEditing(null);
            setDeleting(null);
          }}
        />
      )}
    </Screen>
  );
}
