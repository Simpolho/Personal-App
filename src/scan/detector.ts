import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { scannedValues } from '../domain/barcode';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

// One settings object for the whole session: the library compares it by reference, and a new
// object would make it set the reader up again.
const ZXING_SETTINGS = {
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
};

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string; format?: string }[]> };
type NativeDetector = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * A function that reads barcodes from a video frame. Uses the browser's own reader when it has
 * one for EAN-13; otherwise ZXing, with its WebAssembly served by this app (never a CDN), so it
 * also works offline once cached.
 */
export async function createDetector(): Promise<(video: HTMLVideoElement) => Promise<string[]>> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (Native) {
    try {
      if ((await Native.getSupportedFormats()).includes('ean_13')) {
        const native = new Native({ formats: FORMATS });
        return async (video) => scannedValues(await native.detect(video));
      }
    } catch {
      // Fall back to ZXing.
    }
  }
  prepareZXingModule(ZXING_SETTINGS);
  const zxing = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  return async (video) => scannedValues(await zxing.detect(video));
}
