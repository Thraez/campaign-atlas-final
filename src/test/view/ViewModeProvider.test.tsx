import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ViewModeProvider, useViewMode, VIEW_MODE_STORAGE_KEY } from "@/atlas/view/ViewModeProvider";

function Probe() {
  const { mode, setMode } = useViewMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => setMode(mode === "dm" ? "player" : "dm")}>flip</button>
    </div>
  );
}

describe("ViewModeProvider", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to dm and flips + persists", () => {
    render(<ViewModeProvider><Probe /></ViewModeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("dm");
    act(() => { screen.getByText("flip").click(); });
    expect(screen.getByTestId("mode").textContent).toBe("player");
    expect(localStorage.getItem(VIEW_MODE_STORAGE_KEY)).toBe("player");
  });
  it("rehydrates from localStorage", () => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, "player");
    render(<ViewModeProvider><Probe /></ViewModeProvider>);
    expect(screen.getByTestId("mode").textContent).toBe("player");
  });
});
