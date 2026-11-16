import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { exportAll } from '../../db/backup';
import { db, resetDb } from '../../db/db';
import { createMeal, quickAdd } from '../../db/log';
import { getTargetsFor, setTargets } from '../../db/targets';
import { renderAt, user } from '../../test/render';

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ['canShare', 'share', 'storage']) Reflect.deleteProperty(navigator, key);
});

const lastExportAt = async () => (await db.settings.get('settings'))?.lastExportAt;

test('saving targets applies from today, blanks mean not set', async () => {
  renderAt('#/settings');
  await user.type(await screen.findByLabelText('Calories (kcal)'), '2300');
  await user.type(screen.getByLabelText('Protein (g)'), '160,5');
  await user.click(screen.getByRole('button', { name: /Save/ }));
  await waitFor(async () => expect(await getTargetsFor('2026-11-16')).toEqual({ kcal: 2300, protein: 160.5 }));
  expect(await getTargetsFor('2026-11-15')).toBeNull();
});
test('current targets are shown; clearing them all turns targets off from today', async () => {
  await setTargets('2026-11-01', { kcal: 2300 });
  renderAt('#/settings');
  const kcal = await screen.findByLabelText('Calories (kcal)');
  await waitFor(() => expect(kcal).toHaveValue('2300'));
  await user.clear(kcal);
  await user.click(screen.getByRole('button', { name: /Save/ }));
  await waitFor(async () => expect(await getTargetsFor('2026-11-16')).toBeNull());
  expect(await getTargetsFor('2026-11-10')).toEqual({ kcal: 2300 });
});
test('a target that is not a number is refused', async () => {
  renderAt('#/settings');
  await user.type(await screen.findByLabelText('Calories (kcal)'), 'lots');
  await user.click(screen.getByRole('button', { name: /Save/ }));
  expect(await screen.findByText('Calories (kcal): enter a number')).toBeInTheDocument();
  expect(await getTargetsFor('2026-11-16')).toBeNull();
});
test('import shows a summary or the error', async () => {
  renderAt('#/settings');
  const good = new File([JSON.stringify(await exportAll())], 'b.json', { type: 'application/json' });
  await user.upload(await screen.findByLabelText('Import backup'), good);
  expect(await screen.findByText(/^Imported: \d+ added, \d+ updated, \d+ unchanged$/)).toBeInTheDocument();
  await user.upload(screen.getByLabelText('Import backup'), new File(['{"x":1}'], 'bad.json', { type: 'application/json' }));
  expect(await screen.findByText('Not a backup file from this app')).toBeInTheDocument();
  await user.upload(screen.getByLabelText('Import backup'), new File(['not json at all'], 'worse.json', { type: 'application/json' }));
  expect(await screen.findByText('Not a backup file from this app')).toBeInTheDocument();
});
test('export downloads a dated file when sharing is not available', async () => {
  await quickAdd((await createMeal('2026-11-16')).id, 'Lunch', { kcal: 700 });
  const made: Blob[] = [];
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (made.push(b), 'blob:backup'), revokeObjectURL: () => {} }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('fitness-backup-2026-11-16.json');
  });
  renderAt('#/settings');
  await user.click(await screen.findByRole('button', { name: 'Export backup' }));
  expect(await screen.findByText(/Backup saved/)).toBeInTheDocument();
  expect(click).toHaveBeenCalledTimes(1);
  expect(made).toHaveLength(1);
  expect(await lastExportAt()).toBeDefined();
});
test('export uses the share sheet when the phone offers it', async () => {
  const share = vi.fn(async (_data: ShareData) => {});
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  renderAt('#/settings');
  await user.click(await screen.findByRole('button', { name: 'Export backup' }));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  const file = share.mock.calls[0][0].files![0];
  expect(file.name).toBe('fitness-backup-2026-11-16.json');
  expect(await screen.findByText(/Backup saved/)).toBeInTheDocument();
  expect(await lastExportAt()).toBeDefined();
});
test('a cancelled share does not count as a backup', async () => {
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('cancelled', 'AbortError'); }, configurable: true });
  renderAt('#/settings');
  await user.click(await screen.findByRole('button', { name: 'Export backup' }));
  expect(await screen.findByText(/Export cancelled/)).toBeInTheDocument();
  expect(await lastExportAt()).toBeUndefined();
});
test('storage status, Home Screen instructions and data sources', async () => {
  renderAt('#/settings');
  expect(await screen.findByText('Saved permanently: no')).toBeInTheDocument();
  expect(screen.getByText(/tap Share, then Add to Home Screen/)).toBeInTheDocument();
  expect(screen.getByText(/Instituto Nacional de Saúde Doutor Ricardo Jorge/)).toBeInTheDocument();
  expect(screen.getByText(/USDA FoodData Central/)).toBeInTheDocument();
});
test('from the Home Screen: storage is reported and the instructions are hidden', async () => {
  Object.defineProperty(navigator, 'storage', {
    value: { persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 3.44 * 1024 * 1024 }) },
    configurable: true,
  });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  renderAt('#/settings');
  expect(await screen.findByText('Saved permanently: yes · 3.4 MB used')).toBeInTheDocument();
  expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
});
test('Today links to Settings and Recipes', async () => {
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Back' }));
  await user.click(await screen.findByRole('link', { name: 'Recipes' }));
  expect(await screen.findByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
});
test('when the phone refuses the share sheet, a second tap saves the prepared file', async () => {
  let refuse = true;
  const share = vi.fn(async (_data: ShareData) => {
    if (refuse) throw new DOMException('too late after the tap', 'NotAllowedError');
  });
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  renderAt('#/settings');
  await user.click(await screen.findByRole('button', { name: 'Export backup' }));
  const again = await screen.findByRole('button', { name: 'Save backup file' });
  expect(await lastExportAt()).toBeUndefined(); // nothing saved yet, so the reminder stays on
  refuse = false;
  await user.click(again);
  expect(await screen.findByText(/Backup saved/)).toBeInTheDocument();
  expect(share).toHaveBeenCalledTimes(2);
  expect(await lastExportAt()).toBeDefined();
});
test('from the Home Screen, a plain download is not counted as a backup', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:backup', revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  renderAt('#/settings');
  await user.click(await screen.findByRole('button', { name: 'Export backup' }));
  expect(await screen.findByText(/could not confirm/)).toBeInTheDocument();
  expect(await lastExportAt()).toBeUndefined();
});
