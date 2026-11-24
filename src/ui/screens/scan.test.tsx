import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import nutella from '../../data/fixtures/off-nutella.json';
import { resetDb } from '../../db/db';
import { listFoods, saveFood } from '../../db/foods';
import { createMeal } from '../../db/log';
import type { Meal } from '../../db/types';
import { renderAt, user } from '../../test/render';

// The camera is replaced by a stand-in: each test says what it "sees".
const camera = vi.hoisted(() => ({
  mode: { kind: 'idle' } as { kind: 'idle' } | { kind: 'codes'; codes: string[] } | { kind: 'deny' } | { kind: 'pending' } | { kind: 'reader-fails' },
  release: (() => {}) as () => void,
  stop: (() => {}) as () => void,
  starts: 0,
}));
vi.mock('../../scan/scanner', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../scan/scanner')>();
  return {
    ...real,
    startScanning: async (
      _video: HTMLVideoElement,
      onCode: (code: string) => void,
      _deps?: unknown,
      options?: { onReaderFailed?: () => void },
    ) => {
      camera.starts += 1;
      if (camera.mode.kind === 'deny') throw new real.CameraError('denied');
      if (camera.mode.kind === 'pending') await new Promise<void>((resolve) => { camera.release = resolve; });
      if (camera.mode.kind === 'reader-fails') setTimeout(() => options?.onReaderFailed?.(), 0);
      if (camera.mode.kind === 'codes') {
        const codes = camera.mode.codes;
        setTimeout(() => codes.forEach((c) => onCode(c)), 0);
      }
      return camera.stop;
    },
  };
});

let meal: Meal;
let fetchMock: ReturnType<typeof vi.fn>;
const respond = (body: unknown, status = 200) => fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status }));

beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  meal = await createMeal('2026-11-16');
  camera.mode = { kind: 'idle' };
  camera.stop = vi.fn();
  camera.starts = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

test('Add food has a Scan button that opens the scanner', async () => {
  renderAt(`#/meal/${meal.id}/add`);
  await user.click(await screen.findByRole('link', { name: 'Scan' }));
  expect(await screen.findByLabelText('Barcode')).toBeInTheDocument();
  expect(window.location.hash).toBe(`#/meal/${meal.id}/scan`);
});
test('a saved product goes straight to its amount screen, without going online', async () => {
  const food = await saveFood({ name: 'Nutella', barcode: '3017624010701', basis: '100g', nutrients: { kcal: 539 }, servings: [] });
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByLabelText('Amount')).toHaveValue('100');
  expect(window.location.hash).toBe(`#/meal/${meal.id}/add/${food.id}`);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('a new product is looked up and opened for checking', async () => {
  respond(nutella);
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByRole('heading', { name: 'Check the label' })).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Nutella');
  expect(await listFoods()).toEqual([]);
});
test('a product Open Food Facts does not have opens New food with the barcode', async () => {
  respond({ status: 'failure', result: { id: 'product_not_found' } }, 404);
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByRole('heading', { name: 'New food' })).toBeInTheDocument();
  expect(screen.getByText(/isn't in Open Food Facts/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
test('a refused camera explains itself and still lets you type the barcode', async () => {
  camera.mode = { kind: 'deny' };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByText(/The camera isn't allowed/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.getByLabelText('Barcode')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(camera.starts).toBeGreaterThanOrEqual(2));
});
test('a typed barcode is looked up like a scanned one; a wrong number is caught first', async () => {
  const food = await saveFood({ name: 'Nutella', barcode: '3017624010701', basis: '100g', nutrients: { kcal: 539 }, servings: [] });
  renderAt(`#/meal/${meal.id}/scan`);
  const field = await screen.findByLabelText('Barcode');
  await user.type(field, '3017624010702');
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  expect(await screen.findByText('Check the number: it should be the 8 or 13 digits under the barcode.')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
  await user.clear(field);
  await user.type(field, ' 3017624 010701 ');
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  await waitFor(() => expect(window.location.hash).toBe(`#/meal/${meal.id}/add/${food.id}`));
});
test('the same barcode read twice is looked up once', async () => {
  respond(nutella);
  camera.mode = { kind: 'codes', codes: ['3017624010701', '3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByRole('heading', { name: 'Check the label' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('Cancel turns the camera off and goes back to Add food', async () => {
  renderAt(`#/meal/${meal.id}/scan`);
  await screen.findByLabelText('Barcode');
  await waitFor(() => expect(camera.starts).toBe(1));
  await user.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect(camera.stop).toHaveBeenCalled();
});
test('leaving the screen turns the camera off', async () => {
  const view = renderAt(`#/meal/${meal.id}/scan`);
  await waitFor(() => expect(camera.starts).toBe(1));
  await new Promise((r) => setTimeout(r, 0));
  view.unmount();
  expect(camera.stop).toHaveBeenCalled();
});
test('putting the app in the background turns the camera off until you start it again', async () => {
  renderAt(`#/meal/${meal.id}/scan`);
  await waitFor(() => expect(camera.starts).toBe(1));
  await new Promise((r) => setTimeout(r, 0));
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(camera.stop).toHaveBeenCalled();
  Reflect.deleteProperty(document, 'visibilityState');
  await user.click(await screen.findByRole('button', { name: 'Start camera' }));
  await waitFor(() => expect(camera.starts).toBe(2));
});
test('cancelling while a product is being looked up stays cancelled', async () => {
  let answer: (r: Response) => void = () => {};
  let signal: AbortSignal | undefined;
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>((resolve) => { answer = resolve; });
  });
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByText(/Looking up 3017624010701/)).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect(signal?.aborted).toBe(true); // the request is dropped, not left running
  answer(new Response(JSON.stringify(nutella)));
  await new Promise((r) => setTimeout(r, 50));
  expect(window.location.hash).toBe(`#/meal/${meal.id}/add`);
  expect(screen.queryByRole('heading', { name: 'Check the label' })).toBeNull();
});
test('going to the background while the camera is still starting turns it off when it arrives', async () => {
  camera.mode = { kind: 'pending' };
  renderAt(`#/meal/${meal.id}/scan`);
  await waitFor(() => expect(camera.starts).toBe(1));
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Reflect.deleteProperty(document, 'visibilityState');
  camera.release();
  expect(await screen.findByRole('button', { name: 'Start camera' })).toBeInTheDocument();
  await waitFor(() => expect(camera.stop).toHaveBeenCalled());
});
test('if barcodes cannot be read at all, the screen says so and offers typing', async () => {
  camera.mode = { kind: 'reader-fails' };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByText(/Barcodes can't be read right now/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.getByLabelText('Barcode')).toBeInTheDocument();
});
test('a slow lookup says so after a few seconds and keeps waiting', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
  fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByText(/Looking up 3017624010701/)).toBeInTheDocument();
  expect(screen.queryByText(/Open Food Facts is slow right now/)).toBeNull();
  await vi.advanceTimersByTimeAsync(4_000);
  expect(await screen.findByText('Open Food Facts is slow right now, still looking…')).toBeInTheDocument();
  expect(screen.getByText(/Looking up 3017624010701/)).toBeInTheDocument();
});
test('when the lookup fails, Try again looks the same barcode up again', async () => {
  fetchMock.mockImplementationOnce(async () => {
    throw new TypeError('Load failed');
  });
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  expect(await screen.findByRole('heading', { name: 'New food' })).toBeInTheDocument();
  expect(screen.getByText(/couldn't be looked up right now/)).toBeInTheDocument();
  respond(nutella);
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Check the label' })).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Nutella');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/product/3017624010701?');
});
test('Try again that fails again says so, and can be tapped again', async () => {
  fetchMock.mockImplementation(async () => {
    throw new TypeError('Load failed');
  });
  camera.mode = { kind: 'codes', codes: ['3017624010701'] };
  renderAt(`#/meal/${meal.id}/scan`);
  await user.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Still no answer from Open Food Facts. Try again in a moment, or type the label in.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'New food' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
