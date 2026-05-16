// src/test/settings/MapSettingsPanel.labels.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapSettingsPanel } from "@/atlas/MapSettingsPanel";

const map = { id: "m", width: 100, height: 80, oceanColor: "#88a", wrapX: false } as never;

describe("MapSettingsPanel plain labels", () => {
  it("uses plain labels and no raw field keys or jargon", () => {
    render(<MapSettingsPanel map={map} baseMap={map} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText("Map size")).toBeInTheDocument();
    expect(screen.getByText("Background color")).toBeInTheDocument();
    expect(screen.getByText(/Wrap east–west/)).toBeInTheDocument();
    // No raw keys / jargon anywhere in the rendered panel:
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/oceanColor|wrapX|\bgrid\b\s*key|Unsaved:|Discard local edits|world\.yaml|rebuilds/);
  });
});
