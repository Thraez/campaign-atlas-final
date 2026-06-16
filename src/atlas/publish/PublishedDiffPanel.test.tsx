import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PublishedDiffPanel } from "./PublishedDiffPanel";
import type { AtlasDiff } from "./computeAtlasDiff";

const diff: AtlasDiff = {
  hasChanges: true,
  counts: { entities: 1, placements: 0, maps: 0, overlays: 0 },
  entities: [{ id: "e1", title: "New Tavern", kind: "added" }],
  placements: [],
  maps: [],
  overlays: [],
};

describe("PublishedDiffPanel with precomputed diff", () => {
  it("renders the supplied diff without fetching a baseline", () => {
    render(<PublishedDiffPanel diff={diff} />);
    expect(screen.getByText("New Tavern")).toBeInTheDocument();
  });

  it("shows no-changes message when diff has no changes", () => {
    const emptyDiff: AtlasDiff = {
      hasChanges: false,
      counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
      entities: [],
      placements: [],
      maps: [],
      overlays: [],
    };
    render(<PublishedDiffPanel diff={emptyDiff} />);
    expect(screen.getByText(/no changes since last publish/i)).toBeInTheDocument();
  });
});
