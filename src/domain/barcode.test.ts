import { expect, test } from 'vitest';
import { expandUpcE, normalizeBarcode, normalizeTypedBarcode, scannedValues } from './barcode';

test('normalizeBarcode keeps valid EAN-13 and EAN-8', () => {
  expect(normalizeBarcode('3017624010701')).toBe('3017624010701');
  expect(normalizeBarcode('96385074')).toBe('96385074');
});
test('normalizeBarcode puts UPC-A and GTIN-14 in 13-digit form and ignores spaces and dashes', () => {
  expect(normalizeBarcode('049000050103')).toBe('0049000050103');
  expect(normalizeBarcode('00049000050103')).toBe('0049000050103');
  expect(normalizeBarcode(' 3017624 010701 ')).toBe('3017624010701');
  expect(normalizeBarcode('3017-6240-10701')).toBe('3017624010701');
});
test('normalizeBarcode refuses wrong check digits, letters and other lengths', () => {
  for (const bad of ['3017624010702', 'ABC', '', '12345', '30176240107011234']) expect(normalizeBarcode(bad)).toBeNull();
});
test('a UPC-E barcode is expanded to its full UPC-A form', () => {
  expect(expandUpcE('04963406')).toBe('049000006346'); // last digit 0–2
  expect(expandUpcE('01234505')).toBe('012000003455');
  expect(expandUpcE('01234531')).toBe('012300000451');
  expect(expandUpcE('01234543')).toBe('012340000053');
  expect(expandUpcE('11234555')).toBe('112345000055');
  expect(expandUpcE('21234505')).toBeNull(); // number system must be 0 or 1
  expect(expandUpcE('1234')).toBeNull();
});
test('a scanned UPC-E is turned into the 13-digit form the app stores', () => {
  expect(scannedValues([{ rawValue: '04963406', format: 'upc_e' }, { rawValue: '3017624010701', format: 'ean_13' }]))
    .toEqual(['049000006346', '3017624010701']);
});
test('a typed UPC-E number is accepted when it is not a valid EAN-8', () => {
  expect(normalizeTypedBarcode('04963406')).toBe('0049000006346');
  expect(normalizeTypedBarcode('96385074')).toBe('96385074');
  expect(normalizeTypedBarcode('3017624010702')).toBeNull();
});
