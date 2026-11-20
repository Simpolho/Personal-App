// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('the reader parts are pinned to the exact version the barcode library expects', () => {
  const ours = JSON.parse(readFileSync('package.json', 'utf8')).dependencies['zxing-wasm'];
  const expected = JSON.parse(readFileSync('node_modules/barcode-detector/package.json', 'utf8')).dependencies['zxing-wasm'];
  expect(ours).toBe(expected);
});
