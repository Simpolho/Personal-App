const KEY = 'reloadedForStaleFilesAt';
/** A reload that fails again within this time isn't retried, so a missing file can't cause a reload loop. */
const QUIET_MS = 30_000;

type Win = EventTarget & { location: { reload(): void } };
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/**
 * After an update, a page that is still open runs the old version, and the old version's lazily
 * loaded files (such as the barcode reader) are gone from the server and the app cache. Vite
 * reports that as `vite:preloadError`; reloading picks up the new version, and the hash route
 * brings the person back to the same screen.
 */
export function reloadWhenFilesAreStale(win: Win = window, storage: Store = sessionStorage, now: () => number = Date.now) {
  win.addEventListener('vite:preloadError', () => {
    let last = 0;
    try {
      last = Number(storage.getItem(KEY) ?? 0);
    } catch {
      // storage unavailable: still reload once for this page
    }
    if (now() - last < QUIET_MS) return; // just reloaded for this: let the error show instead
    try {
      storage.setItem(KEY, String(now()));
    } catch {
      // ignore
    }
    win.location.reload();
  });
}
