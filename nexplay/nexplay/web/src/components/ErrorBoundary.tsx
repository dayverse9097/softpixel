import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Last line of defence: a crash in one page shows a friendly message instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Details go to the browser console only. Nothing is sent anywhere.
    console.error('Unhandled error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div role="alert" className="glass max-w-md rounded-panel p-8 text-center">
          <h1 className="mb-3 text-2xl">Something went wrong</h1>
          <p className="mb-5 text-muted">The page hit an unexpected problem. Reloading usually fixes it.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/')}>
            Back to home
          </button>
        </div>
      </main>
    );
  }
}
