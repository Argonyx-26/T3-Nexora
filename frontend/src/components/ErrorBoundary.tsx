import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Keeps one broken screen from taking down the whole app on stage. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="font-display text-4xl">Something went wrong here</div>
        <p className="mt-3 text-[14px] text-muted">This screen hit an error. The rest of AYU is still running.</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-6 h-11 rounded-full border border-line-2 px-5 text-[14px] font-medium hover:border-ink"
        >
          Reload this screen
        </button>
      </div>
    );
  }
}
