import { expect, test } from 'vitest';
import { average7, averageSeries, formatChange, formatKg, parseWeight, weeklyChange } from './weight';

test('parseWeight accepts 20–300 kg with up to 2 decimals and a decimal comma', () => {
  expect(parseWeight('78,45')).toBe(78.45);
  expect(parseWeight('78.4')).toBe(78.4);
  for (const bad of ['78.456', '19.9', '300.01', '', 'abc']) expect(parseWeight(bad)).toBeNull();
});
test('formatKg and formatChange use 2 decimals and a real minus sign', () => {
  expect(formatKg(78.4)).toBe('78.40');
  expect(formatChange(-0.4)).toBe('−0.40');
  expect(formatChange(0.25)).toBe('+0.25');
  expect(formatChange(0)).toBe('0.00');
});

const w = [
  { date: '2026-11-10', kg: 81 },
  { date: '2026-11-12', kg: 82 },
  { date: '2026-11-17', kg: 80 },
  { date: '2026-11-23', kg: 78 },
];

test('average7 is the mean of the weigh-ins in the 7 days ending on a date', () => {
  expect(average7(w, '2026-11-23')).toBe(79);
  expect(average7(w, '2026-11-16')).toBe(81.5);
  expect(average7([], '2026-11-23')).toBeNull();
  expect(average7([{ date: '2026-11-16', kg: 90 }], '2026-11-23')).toBeNull();
});
test('weeklyChange compares this week with the week before, only when both have weigh-ins', () => {
  expect(weeklyChange(w, '2026-11-23')).toBe(-2.5);
  expect(weeklyChange([{ date: '2026-11-23', kg: 78 }], '2026-11-23')).toBeNull();
});
test('averageSeries gives one point per day for the chart', () => {
  const s = averageSeries(w, '2026-11-23', 30);
  expect(s).toHaveLength(30);
  expect(s.at(-1)).toEqual({ date: '2026-11-23', avg: 79 });
  expect(s[0]).toEqual({ date: '2026-10-25', avg: null });
});
