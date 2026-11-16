import { expect, test } from 'vitest';
import { describeAmount, formatNumber, formatWhole } from './format';

test('formatNumber keeps at most two decimals and no trailing zeros', () => {
  expect(formatNumber(80)).toBe('80');
  expect(formatNumber(80.5)).toBe('80.5');
  expect(formatNumber(1.333333)).toBe('1.33');
});
test('describeAmount reads naturally for each kind of unit', () => {
  expect(describeAmount(80, 'g')).toBe('80 g');
  expect(describeAmount(250, 'ml')).toBe('250 ml');
  expect(describeAmount(1, '1 medium')).toBe('1 medium');
  expect(describeAmount(2, '1 medium')).toBe('2 × 1 medium');
  expect(describeAmount(1, 'portion')).toBe('1 portion');
  expect(describeAmount(1.5, 'portion')).toBe('1.5 portions');
  expect(describeAmount(1, 'quick')).toBe('');
});
test('formatWhole rounds and never shows a negative zero', () => {
  expect(formatWhole(119.6)).toBe('120');
  expect(formatWhole(-0.2)).toBe('0');
  expect(formatWhole(-12.4)).toBe('-12');
});
