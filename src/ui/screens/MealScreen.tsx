import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  deleteEntry,
  deleteMeal,
  getMealView,
  pastMealNames,
  renameMeal,
  setMealTime,
  updateEntryAmount,
} from '../../db/log';
import { saveMealAsTemplate } from '../../db/templates';
import type { LogEntry } from '../../db/types';
import { formatNutrient, parseAmount } from '../../domain/nutrients';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { describeAmount, formatNumber, formatWhole } from '../format';
import { btnDanger, btnDone, btnPrimary, btnSecondary, card, errorText, input, row } from '../styles';

function unitLabel(unit: string): string {
  if (unit === 'g' || unit === 'ml') return unit;
  if (unit === 'portion') return 'portions';
  return `× ${unit}`;
}

/** Shown under an entry when it is tapped: change the amount, or delete it. */
function EntryEditor({ entry, mealId, onDone }: { entry: LogEntry; mealId: string; onDone: () => void }) {
  const [value, setValue] = useState(formatNumber(entry.amount));
  const [error, setError] = useState('');
  const isQuick = entry.unit === 'quick';

  async function save() {
    const amount = parseAmount(value);
    if (amount === null) {
      setError('Enter an amount');
      return;
    }
    await updateEntryAmount(entry.id, amount, entry.unit);
    onDone();
  }

  return (
    <div className="space-y-3 bg-zinc-50 px-4 py-3">
      {!isQuick && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Amount">
              <input
                className={input}
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError('');
                }}
              />
            </Field>
          </div>
          <span className="pb-2.5 text-zinc-600">{unitLabel(entry.unit)}</span>
        </div>
      )}
      {error && <p role="alert" className={errorText}>{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        {isQuick ? (
          <Link to={`/meal/${mealId}/quick?entry=${entry.id}`} className={btnSecondary}>
            Edit numbers
          </Link>
        ) : (
          <button type="button" className={btnPrimary} onClick={() => void save()}>
            Save amount
          </button>
        )}
        <button
          type="button"
          className={btnDanger}
          onClick={() => {
            void deleteEntry(entry.id);
            onDone();
          }}
        >
          Delete entry
        </button>
      </div>
    </div>
  );
}

export function MealScreen() {
  const { mealId = '' } = useParams();
  const navigate = useNavigate();
  const view = useLiveQuery(async () => (await getMealView(mealId)) ?? null, [mealId]);
  const pastNames = useLiveQuery(() => pastMealNames(), []) ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState('');

  if (view === undefined) return <Screen title="" />;
  if (view === null) return <Navigate to="/" replace />;

  const { meal, entries, totals } = view;
  const dayPath = `/day/${meal.date}`;

  async function saveTemplate() {
    const saved = await saveMealAsTemplate(meal.id, templateName ?? meal.name);
    setTemplateName(null);
    setSavedNote(`Saved as “${saved.name}”. Find it under Log food → Repeat a saved meal.`);
  }

  return (
    <Screen
      title={meal.name}
      back={dayPath}
      footer={
        <button type="button" className={`${btnDone} w-full`} onClick={() => navigate(dayPath)}>
          Done
        </button>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
        <Field label="Meal name">
          <input
            key={meal.id}
            className={input}
            defaultValue={meal.name}
            list="past-meal-names"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== meal.name) void renameMeal(meal.id, name);
              else e.target.value = meal.name;
            }}
          />
        </Field>
        <Field label="Time">
          <input type="time" className={`${input} block min-w-0 appearance-none`} value={meal.time} onChange={(e) => void setMealTime(meal.id, e.target.value)} />
        </Field>
        <datalist id="past-meal-names">
          {pastNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <section className={`${card} overflow-hidden`}>
        {entries.length === 0 ? (
          <p className="p-4 text-zinc-500">No foods in this meal yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {entries.map((entry) => {
              const amount = describeAmount(entry.amount, entry.unit);
              const open = editing === entry.id;
              return (
                <li key={entry.id}>
                  <button type="button" className={row} aria-expanded={open} onClick={() => setEditing(open ? null : entry.id)}>
                    <span>
                      <span className="block">{entry.nameSnapshot}</span>
                      {amount && <span className="block text-sm text-zinc-500">{amount}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-600">
                      {`${formatNutrient('kcal', entry.nutrientsSnapshot.kcal)} kcal`}
                    </span>
                  </button>
                  {open && <EntryEditor entry={entry} mealId={meal.id} onDone={() => setEditing(null)} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-sm tabular-nums text-zinc-600">
          {`Total ${formatNutrient('kcal', totals.kcal ?? 0)} kcal · P ${formatWhole(totals.protein ?? 0)} g · C ${formatWhole(totals.carbs ?? 0)} g · F ${formatWhole(totals.fat ?? 0)} g`}
        </p>
      </section>

      <Link to={`/meal/${meal.id}/add`} className={`${btnPrimary} w-full`}>
        Add food
      </Link>

      {templateName === null ? (
        <button type="button" className={`${btnSecondary} w-full`} onClick={() => setTemplateName(meal.name)}>
          Save as saved meal
        </button>
      ) : (
        <section className={`${card} space-y-3 p-4`}>
          <Field label="Saved meal name">
            <input className={input} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btnSecondary} onClick={() => setTemplateName(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={() => void saveTemplate()}>
              Save
            </button>
          </div>
        </section>
      )}
      {savedNote && <p role="status" className="text-sm text-emerald-800">{savedNote}</p>}

      <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirmDelete(true)}>
        Delete meal
      </button>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${meal.name}”?`}
          message={entries.length > 0 ? 'Its foods are removed from this day too.' : undefined}
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void deleteMeal(meal.id).then(() => navigate(dayPath, { replace: true }));
          }}
        />
      )}
    </Screen>
  );
}
