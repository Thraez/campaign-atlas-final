import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NudgeButtons } from "@/atlas/NudgeButtons";
import { NUDGE_COARSE, NUDGE_FINE } from "@/atlas/nudgeStep";

describe("NudgeButtons", () => {
  it("shows the active step sizes next to the label", () => {
    render(<NudgeButtons onNudge={vi.fn()} />);
    expect(screen.getByText(`(${NUDGE_FINE} · ⇧${NUDGE_COARSE})`)).toBeTruthy();
  });

  it("defaults the label to 'Nudge'", () => {
    render(<NudgeButtons onNudge={vi.fn()} />);
    expect(screen.getByText("Nudge", { exact: false })).toBeTruthy();
  });

  it("accepts a custom label", () => {
    render(<NudgeButtons label="Nudge whole region" onNudge={vi.fn()} />);
    expect(screen.getByText("Nudge whole region", { exact: false })).toBeTruthy();
  });

  it("plain click nudges by the fine step, preserving direction", () => {
    const onNudge = vi.fn();
    render(<NudgeButtons onNudge={onNudge} />);

    fireEvent.click(screen.getByText("↑"));
    expect(onNudge).toHaveBeenLastCalledWith(0, NUDGE_FINE);

    fireEvent.click(screen.getByText("↓"));
    expect(onNudge).toHaveBeenLastCalledWith(0, -NUDGE_FINE);

    fireEvent.click(screen.getByText("←"));
    expect(onNudge).toHaveBeenLastCalledWith(-NUDGE_FINE, 0);

    fireEvent.click(screen.getByText("→"));
    expect(onNudge).toHaveBeenLastCalledWith(NUDGE_FINE, 0);
  });

  it("Shift+click nudges by the coarse step, preserving direction", () => {
    const onNudge = vi.fn();
    render(<NudgeButtons onNudge={onNudge} />);

    fireEvent.click(screen.getByText("↑"), { shiftKey: true });
    expect(onNudge).toHaveBeenLastCalledWith(0, NUDGE_COARSE);

    fireEvent.click(screen.getByText("←"), { shiftKey: true });
    expect(onNudge).toHaveBeenLastCalledWith(-NUDGE_COARSE, 0);

    fireEvent.click(screen.getByText("↓"), { shiftKey: true });
    expect(onNudge).toHaveBeenLastCalledWith(0, -NUDGE_COARSE);

    fireEvent.click(screen.getByText("→"), { shiftKey: true });
    expect(onNudge).toHaveBeenLastCalledWith(NUDGE_COARSE, 0);
  });
});
