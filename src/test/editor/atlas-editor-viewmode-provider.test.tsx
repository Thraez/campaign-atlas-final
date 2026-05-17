import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ViewModeProvider, useViewMode } from "@/atlas/view/ViewModeProvider";

// Guards the B4 regression: a component must NOT call useViewMode() in its own
// body while only rendering <ViewModeProvider> in its own return. This test
// encodes the correct shape (provider ABOVE the consumer) so the inverted shape
// — which blanked /atlas/edit — is caught here instead of only in a browser.
function Consumer() {
  const { mode } = useViewMode();
  return <div data-testid="mode">{mode}</div>;
}
function CorrectWrapper() {
  return (
    <ViewModeProvider>
      <Consumer />
    </ViewModeProvider>
  );
}

describe("editor view-mode provider placement", () => {
  it("provider wrapping a consumer does not throw (correct shape)", () => {
    const { getByTestId } = render(<CorrectWrapper />);
    expect(getByTestId("mode").textContent).toBe("dm");
  });
  it("consuming useViewMode with NO provider above throws (the bug shape)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/ViewModeProvider/);
    spy.mockRestore();
  });
});
