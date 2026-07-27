import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AtlasLoadState } from "@/atlas/content/AtlasLoadState";

function renderState(props: Partial<ComponentProps<typeof AtlasLoadState>>) {
  return render(
    <MemoryRouter>
      <AtlasLoadState error={null} loading={false} {...props} />
    </MemoryRouter>,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("AtlasLoadState", () => {
  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it("shows the loading label when loading and no error", () => {
    renderState({ loading: true, loadingLabel: "Loading timeline…" });
    expect(screen.getByText("Loading timeline…")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the error title and message when online and errored", () => {
    setOnline(true);
    renderState({ error: "atlas.json 404", errorTitle: "Timeline unavailable" });
    expect(screen.getByText("Timeline unavailable")).toBeInTheDocument();
    expect(screen.getByText("atlas.json 404")).toBeInTheDocument();
  });

  it("shows the offline title instead of the raw error when offline", () => {
    setOnline(false);
    renderState({ error: "atlas.json 404", offlineTitle: "Atlas not available offline yet" });
    expect(screen.getByText("Atlas not available offline yet")).toBeInTheDocument();
    expect(screen.queryByText("atlas.json 404")).not.toBeInTheDocument();
    expect(
      screen.getByText("Open the atlas once while online to cache it for offline use."),
    ).toBeInTheDocument();
  });

  it("renders the back link with the given href and label", () => {
    renderState({ error: "boom", backHref: "/", backLabel: "Back to home" });
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("suppresses the extra hint while offline", () => {
    setOnline(false);
    renderState({ error: "boom", extraHint: <p>Run npm run atlas:build</p> });
    expect(screen.queryByText("Run npm run atlas:build")).not.toBeInTheDocument();
  });

  it("shows the extra hint while online and errored", () => {
    setOnline(true);
    renderState({ error: "boom", extraHint: <p>Run npm run atlas:build</p> });
    expect(screen.getByText("Run npm run atlas:build")).toBeInTheDocument();
  });

  it("shows a Try again button when onRetry is given and online, and calls it on click", () => {
    setOnline(true);
    const onRetry = vi.fn();
    renderState({ error: "boom", onRetry });
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the Try again button while offline even when onRetry is given", () => {
    setOnline(false);
    renderState({ error: "boom", onRetry: vi.fn() });
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("omits the Try again button when onRetry is not given", () => {
    renderState({ error: "boom" });
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});
