import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { deleteWeight, listWeights, logWeight } from '../../db/weight';
import type { WeightEntry } from '../../db/types';
import { addDays, formatDayLabel } from '../../domain/dates';
import { formatKg, parseWeight } from '../../domain/weight';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { WeightChart } from '../components/WeightChart';
import { btnDanger, btnPrimary, btnSecondary, card, errorText, input, sectionTitle } from '../styles';
import { useToday } from '../useToday';
import { DateBox } from '../components/DateBox';

type Note = { ok: boolean; text: string } | null;

/**
 * The weight form. Its note lives in the screen, so a confirmation stays visible when the form
 * starts again on a new entry after saving.
 */
function WeightForm({
  start,
  today,
  note,
  onNote,
  onSaved,
}: {
  start: { date: string; kg: string };
  today: string;
  note: Note;
  onNote: (note: Note) => void;
  onSaved: (text: string) => void;
}) {
  const [date, setDate] = useState(start.date);
  const [kg, setKg] = useState(start.kg);

  async function save() {
    const value = parseWeight(kg);
    if (value === null) return onNote({ ok: false, text: 'Enter a weight between 20 and 300 kg, with up to 2 decimals' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return onNote({ ok: false, text: 'Pick a date' });
    if (date > today) return onNote({ ok: false, text: "The date can't be in the future" });
    await logWeight(date, value);
    onSaved(`Saved ${formatKg(value)} kg for ${formatDayLabel(date)}.`);
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
              onNote(null);
            }}
          />
        </Field>
        <Field label="Date">
          <DateBox
            value={date}
            max={today}
            onChange={(next) => {
              setDate(next);
              onNote(null);
            }}
          />
        </Field>
      </div>
      {note && <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-sm font-medium text-good' : errorText}>{note.text}</p>}
      <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
        Save weight
      </button>
    </section>
  );
}

export function WeightScreen() {
  const today = useToday();
  const weights = useLiveQuery(() => listWeights(), []);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [deleting, setDeleting] = useState<WeightEntry | null>(null);
  const [note, setNote] = useState<Note>(null);

  if (weights === undefined) return <Screen title="Weight" back="/" />;

  const last = weights.at(-1);
  const start = editing
    ? { date: editing.date, kg: formatKg(editing.kg) }
    : { date: today, kg: last ? formatKg(last.kg) : '' };
  const recent = weights.some((w) => w.date >= addDays(today, -29) && w.date <= today);
  // A new entry starts again on a new day and after every save, so the next weight typed can't
  // land on a day that was just logged or edited.
  const newest = weights.reduce((latest, w) => (w.updatedAt > latest ? w.updatedAt : latest), '');

  return (
    <Screen title="Weight" back="/">
      <WeightForm
        key={editing ? `edit-${editing.date}-${editing.updatedAt}` : `new-${today}-${newest}`}
        start={start}
        today={today}
        note={note}
        onNote={setNote}
        onSaved={(text) => {
          setEditing(null);
          setNote({ ok: true, text });
        }}
      />

      {recent && (
        <section className={`${card} p-3`}>
          <WeightChart weights={weights} endDate={today} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className={sectionTitle}>History</h2>
        {weights.length === 0 ? (
          <p className="px-1 text-muted">No weighings yet</p>
        ) : (
          <ul className={`${card} divide-y divide-line overflow-hidden`}>
            {[...weights].reverse().map((w) => {
              const label = formatDayLabel(w.date);
              return (
                <li key={w.date} className="flex items-center justify-between gap-2 py-2 pr-2 pl-4">
                  <span className="whitespace-nowrap tabular-nums">{`${label} · ${formatKg(w.kg)} kg`}</span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${label}`} className={`${btnSecondary} px-3 text-sm`} onClick={() => {
                        setEditing(w);
                        setNote(null);
                      }}>
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
