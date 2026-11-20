import { expect, test, vi } from 'vitest';
import { CameraError, startScanning, type ScanDeps } from './scanner';

function fakeCamera() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const video = { srcObject: null, readyState: 4, play: async () => {}, setAttribute() {} } as unknown as HTMLVideoElement;
  return { tracks, stream, video };
}

const deps = (stream: MediaStream, detect: ScanDeps['detect']): ScanDeps & { getUserMedia: ReturnType<typeof vi.fn> } => ({
  getUserMedia: vi.fn(async () => stream),
  detect,
  intervalMs: 1,
});

const tick = () => new Promise((r) => setTimeout(r, 30));

test('asks for the rear camera, reports the first valid barcode once, and stops the camera', async () => {
  const { tracks, stream, video } = fakeCamera();
  const reads = [['nope'], ['049000050103', '049000050103'], ['049000050103']];
  const d = deps(stream, async () => reads.shift() ?? []);
  const onCode = vi.fn();
  await startScanning(video, onCode, d);
  await tick();
  expect(d.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  expect(onCode).toHaveBeenCalledTimes(1);
  expect(onCode).toHaveBeenCalledWith('0049000050103');
  for (const t of tracks) expect(t.stop).toHaveBeenCalled();
});
test('stopping before anything is read turns the camera off, and stopping twice is fine', async () => {
  const { tracks, stream, video } = fakeCamera();
  const onCode = vi.fn();
  const stop = await startScanning(video, onCode, deps(stream, async () => ['3017624010701']));
  stop();
  stop();
  await tick();
  expect(onCode).not.toHaveBeenCalled();
  for (const t of tracks) expect(t.stop).toHaveBeenCalled();
});
test('a refused camera and a camera that cannot start are told apart', async () => {
  const { video } = fakeCamera();
  const refuse = { getUserMedia: async () => { throw new DOMException('x', 'NotAllowedError'); }, detect: async () => [] };
  await expect(startScanning(video, vi.fn(), refuse)).rejects.toMatchObject({ kind: 'denied' });
  const broken = { getUserMedia: async () => { throw new DOMException('x', 'NotReadableError'); }, detect: async () => [] };
  const error = await startScanning(video, vi.fn(), broken).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CameraError);
  expect(error).toMatchObject({ kind: 'unavailable' });
});
test('a frame that fails to read does not stop scanning', async () => {
  const { stream, video } = fakeCamera();
  let first = true;
  const onCode = vi.fn();
  await startScanning(video, onCode, deps(stream, async () => {
    if (first) { first = false; throw new Error('bad frame'); }
    return ['3017624010701'];
  }));
  await tick();
  expect(onCode).toHaveBeenCalledWith('3017624010701');
});
