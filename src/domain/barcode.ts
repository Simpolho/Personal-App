/** GS1 check digit: weights 3, 1, 3… from the right, not counting the check digit itself. */
function checkDigitOk(code: string): boolean {
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * One form for every barcode, so a product matches however it was read or typed: spaces and
 * dashes removed, UPC-A (12 digits) and GTIN-14 put in 13-digit form. Returns null for anything
 * that isn't a valid EAN-8 or EAN-13 after that, including a wrong check digit.
 */
export function normalizeBarcode(input: string): string | null {
  let code = input.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return null;
  if (code.length === 12) code = `0${code}`;
  else if (code.length === 14 && code.startsWith('0')) code = code.slice(1);
  if (code.length !== 8 && code.length !== 13) return null;
  return checkDigitOk(code) ? code : null;
}

/**
 * Expands an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A, keeping the check digit.
 * Products are stored under the full form, so a short barcode on a can still matches.
 */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, x1, x2, x3, x4, x5, x6, check] = code;
  let body: string;
  if (x6 === '0' || x6 === '1' || x6 === '2') body = `${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === '3') body = `${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === '4') body = `${x1}${x2}${x3}${x4}00000${x5}`;
  else body = `${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  return `${ns}${body}${check}`;
}

/** Raw values from the reader, with UPC-E expanded, ready for normalizeBarcode. */
export function scannedValues(results: { rawValue: string; format?: string }[]): string[] {
  return results.map((r) => (r.format === 'upc_e' ? (expandUpcE(r.rawValue) ?? r.rawValue) : r.rawValue));
}

/**
 * A barcode typed by hand. An 8-digit number is taken as EAN-8 when its check digit fits that,
 * otherwise as UPC-E (the printed digits look the same).
 */
export function normalizeTypedBarcode(input: string): string | null {
  const direct = normalizeBarcode(input);
  if (direct) return direct;
  const expanded = expandUpcE(input.replace(/[\s-]/g, ''));
  return expanded ? normalizeBarcode(expanded) : null;
}
