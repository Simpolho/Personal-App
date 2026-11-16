import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { applyTemplate, deleteTemplate, listTemplates } from '../../db/templates';
import type { MealTemplate } from '../../db/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Screen } from '../components/ui';
import { card, errorText, row } from '../styles';

/** "Repeat a saved meal": pick one and a meal with its foods is added to the day. */
export function TemplatePicker() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const templates = useLiveQuery(() => listTemplates(), []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<MealTemplate | null>(null);

  async function repeat(template: MealTemplate) {
    if (busy) return;
    setBusy(true);
    try {
      await applyTemplate(template.id, date);
      navigate(`/day/${date}`);
    } catch {
      setError(`“${template.name}” has a food that can no longer be logged. Nothing was added.`);
      setBusy(false);
    }
  }

  return (
    <Screen title="Repeat a saved meal" back={`/day/${date}/log`}>
      {error && <p role="alert" className={errorText}>{error}</p>}
      {templates && templates.length === 0 && (
        <p className="text-zinc-500">No saved meals yet. Open a meal and choose “Save as saved meal”.</p>
      )}
      {templates && templates.length > 0 && (
        <ul className={`${card} divide-y divide-zinc-200 overflow-hidden`}>
          {templates.map((template) => (
            <li key={template.id} className="flex items-stretch">
              <button type="button" className={row} onClick={() => void repeat(template)}>
                <span>{template.name}</span>
                <span className="shrink-0 text-sm text-zinc-500">
                  {template.items.length === 1 ? '1 food' : `${template.items.length} foods`}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete saved meal ${template.name}`}
                className="flex w-12 shrink-0 items-center justify-center border-l border-zinc-200 text-xl text-red-700 active:bg-zinc-50"
                onClick={() => setDeleting(template)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          message="Meals already logged from it stay as they are."
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void deleteTemplate(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </Screen>
  );
}
