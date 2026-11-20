import { expect, test } from 'vitest';
import { normalizeBarcode } from './barcode';

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
