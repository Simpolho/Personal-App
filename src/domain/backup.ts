import { localDate } from './dates';

const REMINDER_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * True when a backup reminder should show: 14 days or more since the last export, or, if there
 * has never been one, since the first entry was logged.
 */
export function backupDue(lastExportAt: string | undefined, firstEntryAt: string | undefined, now: Date): boolean {
  const since = lastExportAt ?? firstEntryAt;
  if (!since) return false;
  const then = Date.parse(since);
  if (Number.isNaN(then)) return false;
  return now.getTime() - then >= REMINDER_DAYS * DAY_MS;
}

export function exportFileName(now: Date): string {
  return `fitness-backup-${localDate(now)}.json`;
}
