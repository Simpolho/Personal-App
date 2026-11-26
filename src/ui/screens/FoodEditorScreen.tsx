import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { FoodDraft } from '../../data/openFoodFacts';
import { db } from '../../db/db';
import { deleteFood, getFood, saveFood } from '../../db/foods';
import type { Food, FoodLike } from '../../db/types';
import { normalizeBarcode } from '../../domain/barcode';
import { resolveBarcode, scanDestination } from '../../scan/resolve';
import { NUTRIENT_KEYS, parseAmount, type Basis, type NutrientKey, type Nutrients, type Serving } from '../../domain/nutrients';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Screen } from '../components/ui';
import { formatNumber } from '../format';
import { NUTRIENT_LABELS } from '../labels';
import { btnDanger, btnPrimary, btnSecondary, card, errorText, input } from '../styles';

type ServingRow = { label: string; grams: string };

/** Why New food was opened from a scan without a product to check. */
type ScanReason = 'not-found' | 'offline' | 'error';

const STILL_NO_ANSWER = 'Still no answer from Open Food Facts. Try again in a moment, or type the label in.';

const NOTES: Record<'draft' | ScanReason, string> = {
  draft: 'From Open Food Facts. Anyone can edit it, so check the values against the package.',
  'not-found': "This barcode isn't in Open Food Facts. Type the label in once and the next scan will find it.",
  offline: "This barcode couldn't be looked up right now. Tap Try again, or type the label in.",
  error: "This barcode couldn't be looked up right now. Tap Try again, or type the label in.",
};

/**
 * Manual add and edit. `existing` is the saved food being edited; `template` pre-fills a new
 * food from another one ("Duplicate to edit" on a read-only table food); `draft` pre-fills it
 * from Open Food Facts for checking. `barcode` and `reason` come from a scan. Nothing is saved
 * until Save.
 */
function FoodForm({
  existing,
  template,
  draft,
  barcode,
  reason,
  mealId,
}: {
  existing: Food | null;
  template: FoodLike | null;
  draft: FoodDraft | null;
  barcode: string | null;
  reason: ScanReason | null;
  mealId: string | null;
}) {
  const navigate = useNavigate();
  const source = existing ?? template ?? draft;
  const knownBarcode = existing?.barcode ?? draft?.barcode ?? barcode ?? undefined;
  const [retry, setRetry] = useState<'idle' | 'busy' | 'failed'>('idle');
  const retryLookup = useRef<AbortController | null>(null);
  useEffect(() => () => retryLookup.current?.abort(), []);
  const canRetry = !draft && (reason === 'offline' || reason === 'error') && barcode !== null && mealId !== null;
  const note = draft ? NOTES.draft : retry === 'failed' ? STILL_NO_ANSWER : reason ? NOTES[reason] : null;

  /** Looks the scanned barcode up again, and goes wherever the answer leads, as a scan would. */
  async function tryAgain() {
    if (!barcode || !mealId) return;
    const controller = new AbortController();
    retryLookup.current = controller;
    setRetry('busy');
    const outcome = await resolveBarcode(barcode, undefined, controller.signal);
    if (controller.signal.aborted) return; // the person left meanwhile
    if (outcome.kind === 'offline' || outcome.kind === 'error') return setRetry('failed');
    const { to, state } = scanDestination(mealId, barcode, outcome);
    navigate(to, { replace: true, state });
  }
  const [name, setName] = useState(source?.name ?? '');
  const [brand, setBrand] = useState(source && 'brand' in source ? (source.brand ?? '') : '');
  const [basis, setBasis] = useState<Basis>(source?.basis ?? '100g');
  const [values, setValues] = useState<Record<NutrientKey, string>>(() => {
    const start = {} as Record<NutrientKey, string>;
    for (const key of NUTRIENT_KEYS) {
      const value = source?.nutrients[key];
      start[key] = value === undefined ? '' : formatNumber(value);
    }
    return start;
  });
  const [servings, setServings] = useState<ServingRow[]>(
    () => source?.servings.map((s) => ({ label: s.label, grams: formatNumber(s.grams) })) ?? [],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unit = basis === '100g' ? 'g' : 'ml';
  const addPath = mealId ? `/meal/${mealId}/add` : '/';
  const back = !mealId ? '/' : existing ? `${addPath}/${existing.id}` : template ? `${addPath}/${encodeURIComponent(template.id)}` : addPath;

  function setServing(index: number, change: Partial<ServingRow>) {
    setServings(servings.map((row, i) => (i === index ? { ...row, ...change } : row)));
    setError('');
  }

  async function save() {
    if (busy) return;
    if (name.trim() === '') return setError('Enter a name');
    const nutrients: Nutrients = {};
    for (const key of NUTRIENT_KEYS) {
      if (values[key].trim() === '') {
        if (key === 'kcal') return setError('Enter calories');
        continue; // blank means "not known", never 0
      }
      const value = parseAmount(values[key], { allowZero: true });
      if (value === null) return setError(`${NUTRIENT_LABELS[key]}: enter a number`);
      nutrients[key] = value;
    }
    const cleanServings: Serving[] = [];
    for (const row of servings) {
      if (row.label.trim() === '' && row.grams.trim() === '') continue;
      const grams = parseAmount(row.grams);
      if (row.label.trim() === '' || grams === null) return setError('Each serving needs a name and an amount');
      const label = row.label.trim();
      // These words already mean something as units, so a serving with that name would be ambiguous.
      if (['g', 'ml', 'portion', 'quick'].includes(label.toLowerCase())) return setError(`A serving cannot be called “${label}”`);
      if (cleanServings.some((s) => s.label.toLowerCase() === label.toLowerCase())) return setError(`Two servings are called “${label}”`);
      cleanServings.push({ label, grams });
    }
    setBusy(true);
    const saved = await saveFood({
      id: existing?.id,
      source: existing?.source ?? (draft ? 'off' : undefined),
      barcode: knownBarcode,
      sourceId: existing?.sourceId ?? draft?.sourceId,
      name,
      brand,
      basis,
      nutrients,
      servings: cleanServings,
    });
    if (mealId) navigate(`/meal/${mealId}/add/${saved.id}`, { replace: true });
    else navigate('/', { replace: true });
  }

  return (
    <Screen title={draft ? 'Check the label' : existing ? 'Edit food' : 'New food'} back={back}>
      {note && (
        <div className="space-y-2 rounded-xl bg-warn/15 p-3 text-sm text-warn ring-1 ring-warn/30">
          <p role="note">{note}</p>
          {canRetry && (
            <button type="button" className={`${btnSecondary} w-full`} disabled={retry === 'busy'} onClick={() => void tryAgain()}>
              {retry === 'busy' ? 'Looking up…' : 'Try again'}
            </button>
          )}
        </div>
      )}
      <Field label="Name">
        <input className={input} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
      </Field>
      <Field label="Brand (optional)">
        <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
      </Field>
      {knownBarcode && <p className="px-1 text-sm tabular-nums text-muted">{`Barcode ${knownBarcode}`}</p>}

      <fieldset className={`${card} p-4`}>
        <legend className="sr-only">Values are</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['100g', '100ml'] as const).map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="basis" className="size-5 accent-accent" checked={basis === option} onChange={() => setBasis(option)} />
              {option === '100g' ? 'per 100 g' : 'per 100 ml'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {NUTRIENT_KEYS.map((key) => (
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
      <p className="text-sm text-muted">Leave a box empty when the label does not say. Only calories are required.</p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Servings (optional)</h2>
        {servings.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_2.75rem] gap-2">
            <input
              className={input}
              aria-label={`Serving ${i + 1} name`}
              placeholder="e.g. 1 slice"
              value={row.label}
              onChange={(e) => setServing(i, { label: e.target.value })}
            />
            <input
              className={input}
              inputMode="decimal"
              aria-label={`Serving ${i + 1} amount`}
              placeholder={unit}
              value={row.grams}
              onChange={(e) => setServing(i, { grams: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove serving ${i + 1}`}
              className="flex size-11 items-center justify-center rounded-xl text-xl text-danger ring-1 ring-danger/30"
              onClick={() => setServings(servings.filter((_, j) => j !== i))}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
        <button type="button" className={btnSecondary} onClick={() => setServings([...servings, { label: '', grams: '' }])}>
          Add serving
        </button>
      </section>

      {error && <p role="alert" className={errorText}>{error}</p>}
      <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void save()}>
        Save
      </button>
      {existing && (
        <button type="button" className={`${btnDanger} w-full`} onClick={() => setConfirmDelete(true)}>
          Delete food
        </button>
      )}

      {existing && confirmDelete && (
        <ConfirmDialog
          title={`Delete “${existing.name}”?`}
          message="Days where it is already logged keep their numbers."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void deleteFood(existing.id).then(() => navigate(addPath, { replace: true }));
          }}
        />
      )}
    </Screen>
  );
}

export function FoodEditorScreen() {
  const { id = 'new' } = useParams();
  const [params] = useSearchParams();
  const mealId = params.get('meal');
  const from = params.get('from');
  const barcode = normalizeBarcode(params.get('barcode') ?? '');
  const reasonParam = params.get('reason');
  const reason = reasonParam === 'not-found' || reasonParam === 'offline' || reasonParam === 'error' ? reasonParam : null;
  const state = useLocation().state as { draft?: FoodDraft } | null;
  const draft = id === 'new' && state?.draft ? state.draft : null;

  const [loaded, setLoaded] = useState<{ key: string; existing: Food | null; template: FoodLike | null } | null>(null);
  const key = `${id}|${from ?? ''}|${barcode ?? ''}|${reason ?? ''}`;
  // Read once per food: the form must not reset under the user's fingers when the database changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const existing = id === 'new' ? undefined : await db.foods.get(id);
      const template = id === 'new' && from ? await getFood(from) : undefined;
      if (!cancelled) setLoaded({ key, existing: existing && !existing.deletedAt ? existing : null, template: template ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, from, key]);

  if (loaded?.key !== key) return <Screen title="" />;
  if (id !== 'new' && !loaded.existing) {
    return (
      <Screen title="Not found" back={mealId ? `/meal/${mealId}/add` : '/'}>
        <p className="text-muted">This food is no longer available.</p>
      </Screen>
    );
  }
  return (
    <FoodForm
      key={key}
      existing={loaded.existing}
      template={loaded.template}
      draft={draft}
      barcode={barcode}
      reason={reason}
      mealId={mealId}
    />
  );
}
