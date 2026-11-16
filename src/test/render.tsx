import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';

/** Renders the whole app at a hash route, e.g. renderAt('#/day/2026-11-16'). */
export function renderAt(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

export const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
