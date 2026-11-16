import { expect, test } from 'vitest';
import { backupDue, exportFileName } from './backup';

const now = new Date('2026-11-16T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

test('backupDue', () => {
  expect(backupDue(undefined, undefined, now)).toBe(false);
  expect(backupDue(undefined, daysAgo(15), now)).toBe(true);
  expect(backupDue(daysAgo(13), daysAgo(40), now)).toBe(false);
  expect(backupDue(daysAgo(14), daysAgo(40), now)).toBe(true);
});
test('exportFileName', () => expect(exportFileName(now)).toBe('fitness-backup-2026-11-16.json'));
