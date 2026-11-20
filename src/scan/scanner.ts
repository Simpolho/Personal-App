import { normalizeBarcode } from '../domain/barcode';

/** The camera couldn't be used: refused by the person ('denied') or failed to start ('unavailable'). */
export class CameraError extends Error {
  readonly kind: 'denied' | 'unavailable';

  constructor(kind: 'denied' | 'unavailable') {
    super(kind === 'denied' ? 'Camera access was refused' : 'The camera could not start');
    this.name = 'CameraError';
    this.kind = kind;
  }
}

/** What scanning needs from the outside world; tests pass fakes. */
export interface ScanDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  /** Raw barcode values found in the video's current frame. */
  detect(video: HTMLVideoElement): Promise<string[]>;
  /** Pause between frames, in ms. */
  intervalMs?: number;
}

export function defaultScanDeps(): ScanDeps {
  // The reader (about 1 MB of WebAssembly) is only loaded the first time a frame is read.
  let reader: Promise<(video: HTMLVideoElement) => Promise<string[]>> | null = null;
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    detect: async (video) => {
      reader ??= import('./detector').then((m) => m.createDetector());
      return (await reader)(video);
    },
  };
}

/**
 * Turns on the rear camera, shows it in `video`, and reads frames until a valid barcode appears.
 * Then it turns the camera off and calls `onCode` once, with the barcode in its normal form.
 * Returns a function that turns the camera off (safe to call more than once).
 */
export async function startScanning(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
  deps: ScanDeps = defaultScanDeps(),
): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await deps.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new CameraError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  // iPhone only shows camera video inline (not full screen) and without sound with these set.
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Some browsers refuse play() here; frames still arrive once the video runs.
  }

  const interval = deps.intervalMs ?? 150;
  const readFrame = async () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      try {
        for (const value of await deps.detect(video)) {
          const code = normalizeBarcode(value);
          if (code && !stopped) {
            stop();
            onCode(code);
            return;
          }
        }
      } catch {
        // One unreadable frame: try the next.
      }
    }
    if (!stopped) timer = setTimeout(() => void readFrame(), interval);
  };
  timer = setTimeout(() => void readFrame(), interval);
  return stop;
}
