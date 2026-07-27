import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Boom(): React.ReactElement {
  throw new Error("boom");
}

function Fine(): React.ReactElement {
  return <div data-testid="child">ok</div>;
}

describe("ErrorBoundary", () => {
  // Suppress the expected console.error output from the boundary + React's own logging
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">ok</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders the fallback UI (not a blank screen) when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to the atlas/i })).toBeInTheDocument();
  });

  it("does not propagate the error — no unhandled rejection", () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it("resets and renders new children when resetKeys change", () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary resetKeys={["a"]} onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["b"]} onReset={onReset}>
        <Fine />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("stays crashed when resetKeys are unchanged", () => {
    const { rerender } = render(
      <ErrorBoundary resetKeys={["a"]}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={["a"]}>
        <Fine />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
