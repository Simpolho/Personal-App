import { formatDayLabel } from '../../domain/dates';
import { input } from '../styles';

/**
 * A date box for iPhone. Safari draws a date input's text inside a native box it won't centre,
 * so the date shown is ours ("Mon 23 Nov 2026"), and the real date input lies invisibly on top:
 * a tap still opens the iPhone date picker. The same approach as the meal's time box.
 */
export function DateBox({ value, max, onChange }: { value: string; max?: string; onChange: (date: string) => void }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <div className="relative rounded-xl focus-within:ring-2 focus-within:ring-accent">
      <div aria-hidden="true" className={`${input} flex items-center justify-center whitespace-nowrap tabular-nums`}>
        {valid ? `${formatDayLabel(value)} ${value.slice(0, 4)}` : 'Pick a date'}
      </div>
      <input
        type="date"
        aria-label="Date"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
