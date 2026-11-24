import { expect, test, vi } from 'vitest';
import { reloadWhenFilesAreStale } from './staleVersion';

function fakeWindow() {
  const target = new EventTarget();
  const reload = vi.fn();
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  return { target, reload, storage, win: Object.assign(target, { location: { reload } }) };
}
const preloadError = () => new Event('vite:preloadError', { cancelable: true });

test('a file of the old version that no longer exists reloads the app into the new version', () => {
  const { win, reload, storage } = fakeWindow();
  reloadWhenFilesAreStale(win, storage, () => 1_000_000);
  win.dispatchEvent(preloadError());
  expect(reload).toHaveBeenCalledTimes(1);
});
test('failing again right after that reload does not reload again', () => {
  const { win, reload, storage } = fakeWindow();
  let now = 1_000_000;
  reloadWhenFilesAreStale(win, storage, () => now);
  win.dispatchEvent(preloadError());
  now += 5_000; // the reloaded page fails too (offline, say)
  reloadWhenFilesAreStale(win, storage, () => now);
  win.dispatchEvent(preloadError());
  expect(reload).toHaveBeenCalledTimes(1);
  now += 60_000; // a later update can reload again
  win.dispatchEvent(preloadError());
  expect(reload).toHaveBeenCalledTimes(2);
});
