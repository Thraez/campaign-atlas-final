import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground px-6 text-center"
        >
          <h1 className="text-lg font-semibold">Something went wrong displaying this</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Your data is safe — try reloading the page.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Reload
            </button>
            <a
              href="/atlas"
              className="text-sm px-4 py-2 rounded-md border border-border hover:bg-accent"
            >
              Back to the atlas
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
