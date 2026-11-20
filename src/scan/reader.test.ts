// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest';

const loads = vi.hoisted(() => ({ count: 0, failNext: false }));
vi.mock('./detector', () => ({
  createDetector: async () => {
    loads.count += 1;
    if (loads.failNext) {
      loads.failNext = false;
      throw new Error('could not load the reader');
    }
    return async () => ['3017624010701'];
  },
}));

beforeEach(() => {
  loads.count = 0;
  loads.failNext = false;
  vi.resetModules();
});

const video = {} as HTMLVideoElement;

test('the barcode reader is set up once and reused by later scans', async () => {
  const { defaultScanDeps } = await import('./scanner');
  await defaultScanDeps().detect(video);
  await defaultScanDeps().detect(video);
  expect(loads.count).toBe(1);
});
test('a reader that failed to load is tried again next time', async () => {
  loads.failNext = true;
  const { defaultScanDeps } = await import('./scanner');
  await expect(defaultScanDeps().detect(video)).rejects.toThrow();
  expect(await defaultScanDeps().detect(video)).toEqual(['3017624010701']);
  expect(loads.count).toBe(2);
});
