import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ChangeEvent } from 'react';
import { exportAll, importAll, ImportError, setLastExportAt } from '../../db/backup';
import { db } from '../../db/db';
import { getTargetsFor, setTargets } from '../../db/targets';
import { INSA_SOURCE, USDA_SOURCE } from '../../data/credits';
import { exportFileName } from '../../domain/backup';
import { formatDayLabel, localDate } from '../../domain/dates';
import { parseAmount } from '../../domain/nutrients';
import { TARGET_KEYS, type TargetKey, type TargetValues } from '../../domain/targets';
import { readText, shareOrDownload } from '../../pwa/saveFile';
import { isStandalone, requestPersistence, storageStatus } from '../../pwa/storage';
import { Field, Screen } from '../components/ui';
import { formatNumber } from '../format';
import { NUTRIENT_LABELS } from '../labels';
import { btnPrimary, btnSecondary, card, errorText, input, sectionTitle } from '../styles';

const okText = 'text-sm font-medium text-emerald-800';

function TargetsForm({ current, today }: { current: TargetValues | null; today: string }) {
  const [values, setValues] = useState<Record<TargetKey, string>>(() => {
    const start = {} as Record<TargetKey, string>;
    for (const key of TARGET_KEYS) start[key] = current?.[key] === undefined ? '' : formatNumber(current[key]);
    return start;
  });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const targets: TargetValues = {};
    for (const key of TARGET_KEYS) {
      if (values[key].trim() === '') continue; // blank = not set
      const value = parseAmount(values[key]);
      if (value === null) return setNote({ ok: false, text: `${NUTRIENT_LABELS[key]}: enter a number` });
      targets[key] = value;
    }
    await setTargets(today, targets);
    setNote({
      ok: true,
      text: Object.keys(targets).length > 0 ? 'Targets saved. Earlier days keep the targets they had.' : 'Targets turned off from today.',
    });
  }

  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>Targets</h2>
      <div className={`${card} space-y-3 p-4`}>
        <p className="text-sm text-zinc-500">Daily targets. Each one is optional; leave a box empty for no target.</p>
        <div className="grid grid-cols-2 gap-3">
          {TARGET_KEYS.map((key) => (
            <Field key={key} label={NUTRIENT_LABELS[key]}>
              <input
                className={input}
                inputMode="decimal"
                value={values[key]}
                onChange={(e) => {
                  setValues({ ...values, [key]: e.target.value });
                  setNote(null);
                }}
              />
            </Field>
          ))}
        </div>
        {note && <p role={note.ok ? 'status' : 'alert'} className={note.ok ? okText : errorText}>{note.text}</p>}
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
          Save — applies from today
        </button>
      </div>
    </section>
  );
}

function BackupSection() {
  const lastExportAt = useLiveQuery(async () => (await db.settings.get('settings'))?.lastExportAt ?? null, []);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const before = (await db.settings.get('settings'))?.lastExportAt;
      const file = new File([JSON.stringify(await exportAll())], exportFileName(new Date()), { type: 'application/json' });
      const outcome = await shareOrDownload(file);
      if (outcome === 'cancelled') {
        await setLastExportAt(before); // a cancelled export is not a backup
        setNote({ ok: false, text: 'Export cancelled. No backup was saved.' });
      } else {
        setNote({ ok: true, text: outcome === 'shared' ? 'Backup saved. Keep the file somewhere safe, like Files or iCloud Drive.' : 'Backup saved to your downloads.' });
      }
    } catch {
      setNote({ ok: false, text: 'Export failed. Nothing was saved.' });
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be picked again
    if (!file) return;
    setNote(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readText(file));
      } catch {
        throw new ImportError('Not a backup file from this app');
      }
      const { added, updated, skipped } = await importAll(parsed);
      setNote({ ok: true, text: `Imported: ${added} added, ${updated} updated, ${skipped} unchanged` });
    } catch (error) {
      setNote({ ok: false, text: error instanceof ImportError ? error.message : 'Import failed. Nothing was changed.' });
    }
  }

  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>Backup</h2>
      <div className={`${card} space-y-3 p-4`}>
        <p className="text-sm text-zinc-500">
          {lastExportAt ? `Last backup: ${formatDayLabel(localDate(new Date(lastExportAt)))}.` : 'No backup yet.'} Everything is stored only on
          this phone, so export a backup now and then.
        </p>
        <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => void exportBackup()}>
          Export backup
        </button>
        <label className={`${btnSecondary} w-full cursor-pointer`}>
          Import backup
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void importBackup(e)} />
        </label>
        {note && <p role={note.ok ? 'status' : 'alert'} className={note.ok ? okText : errorText}>{note.text}</p>}
      </div>
    </section>
  );
}

function StorageSection() {
  const [status, setStatus] = useState<{ persisted: boolean; usedMB: number | null } | null>(null);
  const standalone = isStandalone();

  useEffect(() => {
    let cancelled = false;
    void requestPersistence()
      .then(() => storageStatus())
      .then((s) => {
        if (!cancelled) setStatus(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-2">
      <h2 className={sectionTitle}>Storage</h2>
      <div className={`${card} space-y-3 p-4`}>
        <p className="font-medium">
          {status
            ? `Saved permanently: ${status.persisted ? 'yes' : 'no'}${status.usedMB !== null ? ` · ${status.usedMB} MB used` : ''}`
            : 'Checking storage…'}
        </p>
        {!standalone && (
          <p className="text-sm text-zinc-600">
            Open in Safari, tap Share, then Add to Home Screen. Your data is only kept safely when you use the app from the Home Screen icon.
          </p>
        )}
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const today = localDate(new Date());
  const current = useLiveQuery(() => getTargetsFor(today), [today]);

  return (
    <Screen title="Settings" back="/">
      {current !== undefined && <TargetsForm current={current} today={today} />}
      <BackupSection />
      <StorageSection />
      <section className="space-y-2">
        <h2 className={sectionTitle}>Food data</h2>
        <div className={`${card} space-y-2 p-4 text-sm text-zinc-600`}>
          <p>{INSA_SOURCE}</p>
          <p>{USDA_SOURCE}</p>
        </div>
      </section>
    </Screen>
  );
}
