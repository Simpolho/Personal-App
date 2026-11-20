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
