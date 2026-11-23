import type { WeightEntry } from '../../db/types';
import { addDays } from '../../domain/dates';
import { averageSeries, formatKg } from '../../domain/weight';

const W = 320;
const H = 160;
const PAD = { left: 40, right: 8, top: 10, bottom: 18 };
const DAYS = 30;

/**
 * The last 30 days: a dot for each weigh-in and a line for the 7-day average. The vertical axis
 * is fitted to the values shown, with 0.5 kg of room above and below.
 */
export function WeightChart({ weights, endDate }: { weights: WeightEntry[]; endDate: string }) {
  const start = addDays(endDate, -(DAYS - 1));
  const shown = weights.filter((w) => w.date >= start && w.date <= endDate);
  const series = averageSeries(weights, endDate, DAYS);
  const values = [...shown.map((w) => w.kg), ...series.flatMap((p) => (p.avg === null ? [] : [p.avg]))];
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;

  const dayIndex = (date: string) => series.findIndex((p) => p.date === date);
  const x = (i: number) => PAD.left + (i / (DAYS - 1)) * (W - PAD.left - PAD.right);
  const y = (kg: number) => PAD.top + ((max - kg) / (max - min)) * (H - PAD.top - PAD.bottom);
  const line = series
    .map((p, i) => (p.avg === null ? null : `${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`))
    .filter((p): p is string => p !== null)
    .join(' ');

  return (
    <svg role="img" aria-label="Last 30 days" viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-zinc-200" />
      <text x={PAD.left - 6} y={PAD.top + 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
        {formatKg(max - 0.5)}
      </text>
      <text x={PAD.left - 6} y={H - PAD.bottom} textAnchor="end" className="fill-zinc-500 text-[10px]">
        {formatKg(min + 0.5)}
      </text>
      <text x={PAD.left} y={H - 4} className="fill-zinc-500 text-[10px]">
        30 days ago
      </text>
      <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-zinc-500 text-[10px]">
        Today
      </text>
      {line && <polyline data-testid="average-line" points={line} fill="none" className="stroke-emerald-600" strokeWidth={2} />}
      {shown.map((w) => (
        <circle key={w.date} data-testid="weigh-in" cx={x(dayIndex(w.date))} cy={y(w.kg)} r={3} className="fill-zinc-500" />
      ))}
    </svg>
  );
}
