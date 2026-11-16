const pad = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Local calendar date as YYYY-MM-DD. Never derived from toISOString(), which is UTC. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as HH:MM. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocal(date: string, plusDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays);
}

export function addDays(date: string, n: number): string {
  return localDate(parseLocal(date, n));
}

/** e.g. 'Mon 16 Nov'. English names built by hand, so it does not depend on the phone's locale. */
export function formatDayLabel(date: string): string {
  const d = parseLocal(date);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

let lastStamp = 0;

/**
 * Timestamp for createdAt / updatedAt: ISO 8601, UTC.
 *
 * Strictly increasing within a session: records made in the same millisecond (repeating a saved
 * meal logs several entries at once) get stamps 1 ms apart, so sorting by createdAt keeps the
 * order they were made in. If the clock is set back by a second or more, the clock wins.
 */
export function nowIso(): string {
  let t = Date.now();
  if (t <= lastStamp && lastStamp - t < 1000) t = lastStamp + 1;
  lastStamp = t;
  return new Date(t).toISOString();
}
