import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';

/**
 * Renders the whole app at a hash route, e.g. renderAt('#/day/2026-11-16'). `state` is the router
 * state a screen would have been opened with (React Router keeps it in history.state.usr).
 */
export function renderAt(hash: string, state?: unknown) {
  if (state === undefined) window.location.hash = hash;
  else window.history.replaceState({ usr: state, key: 'test', idx: 0 }, '', hash);
  return render(<App />);
}

export const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
