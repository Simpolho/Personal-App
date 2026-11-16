import { afterEach, expect, test, vi } from 'vitest';
import { isStandalone, requestPersistence, storageStatus } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'storage');
  Reflect.deleteProperty(navigator, 'standalone');
});

const stubStorage = (storage: object) => Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });

test('isStandalone is false in a normal browser tab', () => expect(isStandalone()).toBe(false));
test('isStandalone is true from the Home Screen (display-mode or iOS flag)', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
  expect(isStandalone()).toBe(true);
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
  expect(isStandalone()).toBe(true);
});
test('without the Storage API nothing is promised', async () => {
  expect(await requestPersistence()).toBe(false);
  expect(await storageStatus()).toEqual({ persisted: false, usedMB: null });
});
test('persistence and usage are reported when the browser supports them', async () => {
  stubStorage({ persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 3.44 * 1024 * 1024 }) });
  expect(await requestPersistence()).toBe(true);
  expect(await storageStatus()).toEqual({ persisted: true, usedMB: 3.4 });
});
test('a browser that throws is treated as "not saved permanently"', async () => {
  stubStorage({ persist: async () => { throw new Error('no'); }, persisted: async () => { throw new Error('no'); }, estimate: async () => { throw new Error('no'); } });
  expect(await requestPersistence()).toBe(false);
  expect(await storageStatus()).toEqual({ persisted: false, usedMB: null });
});
