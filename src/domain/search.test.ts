import { expect, test } from 'vitest';
import { matches, normalize } from './search';

test('normalize strips accents and punctuation', () => expect(normalize('Açúcar, Amarelo!')).toBe('acucar amarelo'));
test('matches word starts across accents', () => {
  expect(matches('acucar', 'Açúcar amarelo')).toBe(true);
  expect(matches('rice', 'Rice, white, cooked')).toBe(true);
  expect(matches('rice', 'Brown rice')).toBe(true);
  expect(matches('rice', 'Price list')).toBe(false);
  expect(matches('arroz coz', 'Arroz agulha, cozido')).toBe(true);
  expect(matches('', 'Arroz')).toBe(false);
});
