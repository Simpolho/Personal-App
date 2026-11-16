// Runs with TZ=Europe/Lisbon (set by the `test` script).
import { expect, test } from 'vitest';
import { addDays, formatDayLabel, localDate, localTime } from './dates';

test('localDate uses local time, not UTC', () => {
  expect(localDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02'); // 00:30 in Lisbon summer
  expect(localDate(new Date('2026-11-16T10:00:00Z'))).toBe('2026-11-16');
});
test('localTime is HH:MM local', () => expect(localTime(new Date('2026-07-01T07:05:00Z'))).toBe('08:05'));
test('addDays crosses months and years', () => {
  expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); // DST change weekend
});
test('formatDayLabel', () => expect(formatDayLabel('2026-11-16')).toBe('Mon 16 Nov'));
