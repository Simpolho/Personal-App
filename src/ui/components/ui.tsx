import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Page frame: a top bar with an optional back link and a title, then the content in one column.
 * `footer` is pinned to the bottom of the screen, where the thumb is.
 */
export function Screen({ title, back, footer, children }: { title: string; back?: string; footer?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-12 items-center gap-1 px-2">
          {back !== undefined && (
            <Link to={back} aria-label="Back" className="flex size-11 items-center justify-center text-2xl text-emerald-700">
              <span aria-hidden="true">‹</span>
            </Link>
          )}
          <h1 className="flex-1 truncate px-2 text-lg font-semibold">{title}</h1>
        </div>
      </header>
      <main className={`flex-1 space-y-4 p-4 ${footer ? 'pb-32' : 'pb-[calc(env(safe-area-inset-bottom)+1.5rem)]'}`}>{children}</main>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
          {footer}
        </div>
      )}
    </div>
  );
}

/** A labelled form control. The label wraps the control, so tapping the text focuses it. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}
