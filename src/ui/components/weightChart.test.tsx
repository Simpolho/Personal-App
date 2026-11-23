import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import type { WeightEntry } from '../../db/types';
import { WeightChart } from './WeightChart';

const w = (date: string, kg: number): WeightEntry => ({ id: date, date, kg, createdAt: '', updatedAt: '' });

test('the top and bottom labels sit level with the highest and lowest values they name', () => {
  const { container } = render(<WeightChart weights={[w('2026-11-10', 79.3), w('2026-11-23', 78.45)]} endDate="2026-11-23" />);
  const label = (text: string) => [...container.querySelectorAll('text')].find((t) => t.textContent === text);
  const dots = [...container.querySelectorAll('[data-testid="weigh-in"]')];
  const cy = (kg: number) => dots.map((d) => Number(d.getAttribute('cy'))).sort((a, b) => a - b)[kg > 79 ? 0 : 1];
  expect(Number(label('79.30')?.getAttribute('y'))).toBeCloseTo(cy(79.3), 1);
  expect(Number(label('78.45')?.getAttribute('y'))).toBeCloseTo(cy(78.45), 1);
});
test('a single weigh-in draws one dot and no NaN coordinates', () => {
  const { container } = render(<WeightChart weights={[w('2026-11-23', 78)]} endDate="2026-11-23" />);
  expect(container.querySelectorAll('[data-testid="weigh-in"]')).toHaveLength(1);
  expect(container.innerHTML).not.toContain('NaN');
});
