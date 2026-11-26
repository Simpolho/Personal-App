/** Shared Tailwind class strings. Tap targets are at least 44 px high (min-h-11). */
export const card = 'rounded-2xl bg-card ring-1 ring-line';
const btn =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-base font-medium transition active:scale-[0.98] disabled:opacity-50';
export const btnPrimary = `${btn} bg-accent text-on-accent`;
export const btnSecondary = `${btn} bg-raised text-fg`;
/** Finishing a screen: light, so it is not mistaken for the blue action buttons. */
export const btnDone = `${btn} bg-fg text-page`;
export const btnDanger = `${btn} bg-raised text-danger`;
export const input =
  'min-h-11 w-full rounded-xl border-0 bg-raised px-3 text-base text-fg ring-1 ring-line-strong placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent';
export const row = 'flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-raised';
export const sectionTitle = 'px-1 text-sm font-medium uppercase tracking-wide text-muted';
export const errorText = 'text-sm font-medium text-danger';
