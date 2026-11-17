/** Shared Tailwind class strings. Tap targets are at least 44 px high (min-h-11). */
export const card = 'rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200';
const btn =
  'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-base font-medium transition active:scale-[0.98] disabled:opacity-50';
export const btnPrimary = `${btn} bg-emerald-600 text-white`;
export const btnSecondary = `${btn} bg-white text-zinc-900 ring-1 ring-zinc-300`;
/** Finishing a screen: dark, so it is not mistaken for the green action buttons. */
export const btnDone = `${btn} bg-zinc-900 text-white`;
export const btnDanger = `${btn} bg-white text-red-700 ring-1 ring-red-200`;
export const input =
  'min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-zinc-900 ring-1 ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-600';
export const row = 'flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left active:bg-zinc-50';
export const sectionTitle = 'px-1 text-sm font-medium uppercase tracking-wide text-zinc-500';
export const errorText = 'text-sm font-medium text-red-700';
