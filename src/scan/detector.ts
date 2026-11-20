import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
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
        return async (video) => (await native.detect(video)).map((r) => r.rawValue);
      }
    } catch {
      // Fall back to ZXing.
    }
  }
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  });
  const zxing = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  return async (video) => (await zxing.detect(video)).map((r) => r.rawValue);
}
