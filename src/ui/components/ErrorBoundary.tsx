import { Component, type ReactNode } from 'react';
import { btnPrimary, btnSecondary } from '../styles';

/**
 * Catches a screen that fails to draw, so the app never shows a blank page with no way out
 * (a Home Screen app has no address bar). Settings stays reachable for export and import.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-zinc-600">This screen could not be shown. Your data has not been deleted.</p>
        <button type="button" className={btnPrimary} onClick={() => window.location.reload()}>
          Try again
        </button>
        <a href="#/settings" className={btnSecondary} onClick={() => this.setState({ failed: false })}>
          Open Settings
        </a>
      </div>
    );
  }
}
