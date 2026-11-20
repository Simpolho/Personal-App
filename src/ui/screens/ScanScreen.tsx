import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { normalizeTypedBarcode } from '../../domain/barcode';
import { resolveBarcode } from '../../scan/resolve';
import { CameraError, startScanning } from '../../scan/scanner';
import { Field, Screen } from '../components/ui';
import { btnPrimary, btnSecondary, errorText, input } from '../styles';

type Phase =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'looking-up'; code: string }
  | { kind: 'camera-error'; error: 'denied' | 'unavailable' | 'reader' }
  | { kind: 'stopped' };

const CAMERA_ERRORS = {
  denied: "The camera isn't allowed. Tap Try again and choose Allow, or type the barcode below.",
  unavailable: "The camera couldn't start. Type the barcode below, or restart the phone if this keeps happening.",
  reader: "Barcodes can't be read right now. Type the number below, or tap Try again.",
};

/**
 * Reads a barcode with the rear camera (or typed in), then: a saved product → its amount screen;
 * a product in Open Food Facts → the food editor to check it; otherwise → New food with the barcode.
 */
export function ScanScreen() {
  const { mealId = '' } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const handled = useRef(false);
  const alive = useRef(true);
  /** False while the app is in the background: a camera that arrives then is turned straight off. */
  const wantCamera = useRef(true);
  const lookup = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState('');

  const stopCamera = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  const handleCode = useCallback(
    async (code: string) => {
      if (handled.current) return; // one barcode per visit, however many frames saw it
      handled.current = true;
      stopCamera();
      setPhase({ kind: 'looking-up', code });
      const controller = new AbortController();
      lookup.current = controller;
      const outcome = await resolveBarcode(code, undefined, controller.signal);
      if (!alive.current) return; // the person left while it was looking: stay where they went
      if (outcome.kind === 'saved') {
        navigate(`/meal/${mealId}/add/${outcome.food.id}`, { replace: true });
      } else if (outcome.kind === 'found') {
        navigate(`/foods/new?meal=${mealId}&barcode=${code}`, { replace: true, state: { draft: outcome.draft } });
      } else {
        navigate(`/foods/new?meal=${mealId}&barcode=${code}&reason=${outcome.kind}`, { replace: true });
      }
    },
    [mealId, navigate, stopCamera],
  );

  // Start the camera whenever the screen is (re)started.
  useEffect(() => {
    if (phase.kind !== 'starting') return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    startScanning(video, (code) => void handleCode(code), undefined, {
      onReaderFailed: () => {
        stopRef.current = null;
        setPhase({ kind: 'camera-error', error: 'reader' });
      },
    })
      .then((stop) => {
        if (cancelled || handled.current || !wantCamera.current) {
          stop();
          return;
        }
        stopRef.current = stop;
        setPhase((p) => (p.kind === 'starting' ? { kind: 'scanning' } : p));
      })
      .catch((error: unknown) => {
        if (!cancelled) setPhase({ kind: 'camera-error', error: error instanceof CameraError ? error.kind : 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [phase.kind, handleCode]);

  // The camera never stays on in the background or after leaving.
  useEffect(() => {
    alive.current = true;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      wantCamera.current = false;
      if (stopRef.current) {
        stopCamera();
        setPhase({ kind: 'stopped' });
      } else {
        // Still starting: the start effect turns the camera off as soon as it arrives.
        setPhase((p) => (p.kind === 'starting' ? { kind: 'stopped' } : p));
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive.current = false;
      lookup.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      stopCamera();
    };
  }, [stopCamera]);

  function lookUpTyped(event: FormEvent) {
    event.preventDefault();
    const code = normalizeTypedBarcode(typed);
    if (!code) {
      setTypedError('Check the number: it should be the 8 or 13 digits under the barcode.');
      return;
    }
    void handleCode(code);
  }

  const restart = () => {
    handled.current = false;
    wantCamera.current = true;
    setPhase({ kind: 'starting' });
  };

  return (
    <Screen title="Scan" back={`/meal/${mealId}/add`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
        {(phase.kind === 'starting' || phase.kind === 'scanning') && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-white/80" />
        )}
        {phase.kind !== 'scanning' && phase.kind !== 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center text-white">
            {phase.kind === 'looking-up' && <p role="status">{`Looking up ${phase.code}…`}</p>}
            {phase.kind === 'camera-error' && (
              <>
                <p role="alert">{CAMERA_ERRORS[phase.error]}</p>
                <button type="button" className={btnSecondary} onClick={restart}>
                  Try again
                </button>
              </>
            )}
            {phase.kind === 'stopped' && (
              <>
                <p>The camera is off.</p>
                <button type="button" className={btnSecondary} onClick={restart}>
                  Start camera
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <p className="px-1 text-sm text-zinc-500">Point the camera at the barcode; it reads it by itself.</p>

      <form className="space-y-2" onSubmit={lookUpTyped}>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Barcode">
            <input
              className={input}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Or type the numbers"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setTypedError('');
              }}
            />
          </Field>
          <button type="submit" className={btnPrimary} disabled={phase.kind === 'looking-up'}>
            Look up
          </button>
        </div>
        {typedError && <p role="alert" className={errorText}>{typedError}</p>}
      </form>

      <Link to={`/meal/${mealId}/add`} className={`${btnSecondary} w-full`}>
        Cancel
      </Link>
    </Screen>
  );
}
