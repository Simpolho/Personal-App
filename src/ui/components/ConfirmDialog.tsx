import { btnDanger, btnSecondary } from '../styles';

/** In-app confirmation (never window.confirm, which Home Screen web apps handle badly). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {message && <p className="text-zinc-600">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={btnSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
