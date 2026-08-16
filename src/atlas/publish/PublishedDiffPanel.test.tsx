import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { PublishedDiffPanel } from "./PublishedDiffPanel";
import type { AtlasDiff } from "./computeAtlasDiff";

const META = { meta: {}, hadBaseline: true };

const diff: AtlasDiff = {
  hasChanges: true,
  counts: { entities: 1, placements: 0, maps: 0, overlays: 0 },
  entities: [{ id: "e1", title: "New Tavern", kind: "added" }],
  placements: [],
  maps: [],
  overlays: [],
  ...META,
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
      ...META,
    };
    render(<PublishedDiffPanel diff={emptyDiff} />);
    expect(screen.getByText(/no changes since last publish/i)).toBeInTheDocument();
  });

  it("shows first-publish message instead of no-changes when there was no baseline", () => {
    const noBaselineDiff: AtlasDiff = {
      hasChanges: false,
      hadBaseline: false,
      counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
      entities: [],
      placements: [],
      maps: [],
      overlays: [],
      meta: {},
    };
    render(<PublishedDiffPanel diff={noBaselineDiff} />);
    expect(screen.getByText(/first publish.*your whole world will go live/i)).toBeInTheDocument();
    expect(screen.queryByText(/no changes since last publish/i)).not.toBeInTheDocument();
  });

  it("shows entity count badge in the panel header", () => {
    render(<PublishedDiffPanel diff={diff} />);
    expect(screen.getByText("1 entities")).toBeInTheDocument();
  });

  it("shows pin count badge when diff has placement changes", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 2, maps: 0, overlays: 0 },
      entities: [],
      placements: [
        { entityId: "e1", entityTitle: "A", mapId: "m1", kind: "added", after: { x: 10, y: 20 } },
        { entityId: "e2", entityTitle: "B", mapId: "m1", kind: "removed", before: { x: 5, y: 5 } },
      ],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText("2 pins")).toBeInTheDocument();
  });

  it("shows maps/overlays combined badge when diff has map or overlay changes", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 0, maps: 1, overlays: 1 },
      entities: [],
      placements: [],
      maps: [{ id: "m1", name: "The Keep", kind: "added" }],
      overlays: [{ mapId: "m1", kind: "region-added", name: "Throne Room" }],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText("2 maps/overlays")).toBeInTheDocument();
  });

  it("renders Placements section with an added placement", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 1, maps: 0, overlays: 0 },
      entities: [],
      placements: [
        {
          entityId: "e1",
          entityTitle: "Corven",
          mapId: "map1",
          kind: "added",
          after: { x: 100, y: 200 },
        },
      ],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.getByText(/PLACEMENTS/i)).toBeInTheDocument();
  });

  it("shows moved placement hint with before/after coordinates", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 1, maps: 0, overlays: 0 },
      entities: [],
      placements: [
        {
          entityId: "e1",
          entityTitle: "Guard Post",
          mapId: "dungeon",
          kind: "moved",
          before: { x: 10, y: 20 },
          after: { x: 30, y: 40 },
        },
      ],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText(/\(10,20\).*\(30,40\)/)).toBeInTheDocument();
  });

  it("shows removed placement hint with map name", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 1, maps: 0, overlays: 0 },
      entities: [],
      placements: [
        {
          entityId: "e1",
          entityTitle: "Old Camp",
          mapId: "overworld",
          kind: "removed",
          before: { x: 5, y: 5 },
        },
      ],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText(/overworld: removed/)).toBeInTheDocument();
  });

  it("renders Maps section with an added map", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 0, maps: 1, overlays: 0 },
      entities: [],
      placements: [],
      maps: [{ id: "m1", name: "The Undercroft", kind: "added" }],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText("The Undercroft")).toBeInTheDocument();
    // Section heading renders as "Maps (1)" — use case-sensitive match to avoid matching the badge "1 maps/overlays"
    expect(screen.getByText(/Maps \(\d+\)/)).toBeInTheDocument();
  });

  it("renders Regions & routes section with an overlay change", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 0, placements: 0, maps: 0, overlays: 1 },
      entities: [],
      placements: [],
      maps: [],
      overlays: [{ mapId: "m1", kind: "region-added", name: "Throne Room" }],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText("Throne Room")).toBeInTheDocument();
    expect(screen.getByText(/REGIONS & ROUTES/i)).toBeInTheDocument();
  });

  it("shows visibility-changed hint with old → new visibility", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 1, placements: 0, maps: 0, overlays: 0 },
      entities: [
        { id: "e1", title: "Aldric", kind: "visibility-changed", before: "dm", after: "player" },
      ],
      placements: [],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText(/visibility: dm → player/)).toBeInTheDocument();
  });

  it("shows title-changed hint with old → new title", () => {
    const d: AtlasDiff = {
      hasChanges: true,
      counts: { entities: 1, placements: 0, maps: 0, overlays: 0 },
      entities: [
        {
          id: "e1",
          title: "New Name",
          kind: "title-changed",
          before: "Old Name",
          after: "New Name",
        },
      ],
      placements: [],
      maps: [],
      overlays: [],
      ...META,
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText(/title: Old Name → New Name/)).toBeInTheDocument();
  });

  it("collapse toggle hides content and flips aria-expanded", () => {
    render(<PublishedDiffPanel diff={diff} />);
    const header = screen.getByRole("button", { name: /changes since last publish/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("New Tavern")).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("New Tavern")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("New Tavern")).toBeInTheDocument();
  });

  it("shows the baseline publish date in the header when meta.baselinePublishedAt is set", () => {
    const d: AtlasDiff = {
      ...diff,
      meta: { baselinePublishedAt: "2026-07-12T14:03:00Z" },
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.getByText(/since \d/)).toBeInTheDocument();
  });

  it("shows no baseline-date subtitle when meta.baselinePublishedAt is absent", () => {
    render(<PublishedDiffPanel diff={diff} />);
    expect(screen.queryByText(/since \d/)).not.toBeInTheDocument();
  });

  it("shows no baseline-date subtitle (never 'Invalid Date') when meta.baselinePublishedAt is unparseable", () => {
    const d: AtlasDiff = {
      ...diff,
      meta: { baselinePublishedAt: "not-a-real-date" },
    };
    render(<PublishedDiffPanel diff={d} />);
    expect(screen.queryByText(/since \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });

  it("shows no baseline-date subtitle on a first-ever publish with no baseline", () => {
    const noBaselineDiff: AtlasDiff = {
      hasChanges: false,
      hadBaseline: false,
      counts: { entities: 0, placements: 0, maps: 0, overlays: 0 },
      entities: [],
      placements: [],
      maps: [],
      overlays: [],
      meta: {},
    };
    render(<PublishedDiffPanel diff={noBaselineDiff} />);
    expect(screen.queryByText(/since \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });
});

describe("PublishedDiffPanel — fetch-based states", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading text while baseline fetch is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<PublishedDiffPanel current={undefined} />);
    expect(screen.getByText(/loading baseline/i)).toBeInTheDocument();
  });

  it("shows no-baseline message when fetch returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false })),
    );
    render(<PublishedDiffPanel current={undefined} />);
    await waitFor(() =>
      expect(screen.getByText(/no baseline snapshot found/i)).toBeInTheDocument(),
    );
  });
});
