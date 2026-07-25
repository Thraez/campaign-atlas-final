/**
 * Tests for src/atlas/tabs/RegionsTab.tsx — N63 hygiene nibble
 *
 * Covers the key render branches of the Regions authoring panel:
 *   - Empty state message when no regions exist
 *   - Region list items rendered when effective regions are populated
 *   - "new" and "edit" badges for draft-added / draft-edited regions
 *   - Selected region form shown when a region is selected
 *   - Validation chips: absent when issues empty; blocking; warning
 *   - Dirty state: Discard button absent/present + calls reset
 *   - Drawing mode: Draw button shown; drawing indicators shown
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RegionsTab } from "@/atlas/tabs/RegionsTab";
import type { RegionDraftAPI, RegionDraft, RegionIssue } from "@/atlas/regions/useRegionDraft";
import type { AtlasProject, MapDocument, Region } from "@/atlas/content/schema";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeMap(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    id: "map-1",
    worldId: "world-1",
    name: "Test Map",
    width: 2000,
    height: 2000,
    layers: [],
    routes: [],
    regions: [],
    ...overrides,
  } as MapDocument;
}

function makeProject(overrides: Partial<AtlasProject> = {}): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [{ id: "map-1", name: "Test Map" } as MapDocument],
    entities: [],
    placements: [],
    assets: [],
    ...overrides,
  } as unknown as AtlasProject;
}

const EMPTY_DRAFT: RegionDraft = { edits: {}, added: [], deleted: [] };

function makeMockApi(overrides: Partial<RegionDraftAPI> = {}): RegionDraftAPI {
  return {
    draft: EMPTY_DRAFT,
    effective: [],
    dirty: false,
    dirtyCount: 0,
    selectedId: null,
    setSelectedId: vi.fn(),
    drawing: false,
    draftPoints: [],
    startDraw: vi.fn(),
    cancelDraw: vi.fn(),
    addDraftPoint: vi.fn(),
    removeLastDraftPoint: vi.fn(),
    finishDraw: vi.fn(() => null),
    patch: vi.fn(),
    movePoint: vi.fn(),
    insertPointAfter: vi.fn(),
    deletePoint: vi.fn(),
    translate: vi.fn(),
    duplicate: vi.fn(() => null),
    remove: vi.fn(),
    reset: vi.fn(),
    snapshot: vi.fn(() => EMPTY_DRAFT),
    applySnapshot: vi.fn(),
    issues: [],
    ...overrides,
  };
}

function makeRegion(overrides: Partial<Region> = {}): Region {
  return {
    id: "r1",
    name: "Forest",
    mapId: "map-1",
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
    visibility: "player",
    color: "#7fb069",
    fillOpacity: 0.18,
    strokeOpacity: 0.85,
    ...overrides,
  } as Region;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RegionsTab — Empty state", () => {
  it("shows 'No regions yet' message when effective is empty", () => {
    render(
      <RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ effective: [] })} />,
    );
    expect(screen.getByText(/No regions yet/)).toBeTruthy();
  });
});

describe("RegionsTab — Region list", () => {
  it("renders region name and point count when regions are present", () => {
    const region = makeRegion({
      name: "Dark Forest",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    });
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region] })}
      />,
    );
    expect(screen.getByText("Dark Forest")).toBeTruthy();
    expect(screen.getByText("4 pts")).toBeTruthy();
  });

  it("renders 'new' badge for a region in draft.added", () => {
    const region = makeRegion({ id: "r-new", name: "New Zone" });
    const draft: RegionDraft = { edits: {}, added: [region], deleted: [] };
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], draft })}
      />,
    );
    expect(screen.getByText("new")).toBeTruthy();
  });

  it("renders 'edit' badge for a region with edits (not in draft.added)", () => {
    const region = makeRegion({ id: "r-edit", name: "Edited Zone" });
    const draft: RegionDraft = {
      edits: { "r-edit": { name: "Edited Zone" } },
      added: [],
      deleted: [],
    };
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], draft })}
      />,
    );
    expect(screen.getByText("edit")).toBeTruthy();
  });
});

describe("RegionsTab — Selected region form", () => {
  it("shows form fields when a region is selected", () => {
    const region = makeRegion({ id: "r1", name: "Highland" });
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: "r1" })}
      />,
    );
    // Name field populated with region name
    const input = screen.getByDisplayValue("Highland");
    expect(input).toBeTruthy();
  });

  it("does not show form fields when no region is selected", () => {
    const region = makeRegion({ id: "r1", name: "Highland" });
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: null })}
      />,
    );
    expect(screen.queryByDisplayValue("Highland")).toBeNull();
  });
});

describe("RegionsTab — Nudge whole region", () => {
  it("plain click translates the selected region by the fine step", () => {
    const region = makeRegion({ id: "r1", name: "Highland" });
    const translate = vi.fn();
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: "r1", translate })}
      />,
    );
    fireEvent.click(screen.getByText("↑"));
    expect(translate).toHaveBeenCalledWith("r1", 0, 100);
  });

  it("Shift+click translates the selected region by the coarse step", () => {
    const region = makeRegion({ id: "r1", name: "Highland" });
    const translate = vi.fn();
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: "r1", translate })}
      />,
    );
    fireEvent.click(screen.getByText("→"), { shiftKey: true });
    expect(translate).toHaveBeenCalledWith("r1", 500, 0);
  });
});

describe("RegionsTab — Validation chips", () => {
  it("validation chips absent when issues list is empty", () => {
    render(
      <RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ issues: [] })} />,
    );
    expect(screen.queryByText(/blocking/i)).toBeNull();
  });

  it("blocking issue message rendered", () => {
    const issues: RegionIssue[] = [
      {
        severity: "blocking",
        code: "too-few-points",
        message: "Region r1 needs at least 3 points.",
      },
    ];
    render(<RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ issues })} />);
    expect(screen.getByText("Region r1 needs at least 3 points.")).toBeTruthy();
  });

  it("warning issue message rendered", () => {
    const issues: RegionIssue[] = [
      { severity: "warning", code: "small-area", message: "Region r1 covers a very small area." },
    ];
    render(<RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ issues })} />);
    expect(screen.getByText("Region r1 covers a very small area.")).toBeTruthy();
  });
});

describe("RegionsTab — Dirty state", () => {
  it("Discard button absent when not dirty", () => {
    render(
      <RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ dirty: false })} />,
    );
    expect(screen.queryByText(/Discard local/)).toBeNull();
  });

  it("Discard button present when dirty; click calls reset", () => {
    const reset = vi.fn();
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ dirty: true, reset })}
      />,
    );
    const btn = screen.getByText(/Discard local/);
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("RegionsTab — Delete confirm", () => {
  it("delete trigger opens an in-app confirm; cancel leaves the region intact", () => {
    const remove = vi.fn();
    const region = makeRegion({ id: "r1", name: "Highland" });
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: "r1", remove })}
      />,
    );
    fireEvent.click(screen.getByTitle("Delete"));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText('Delete region "Highland"?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("delete trigger then confirm calls remove with the region id", () => {
    const remove = vi.fn();
    const region = makeRegion({ id: "r1", name: "Highland" });
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({ effective: [region], selectedId: "r1", remove })}
      />,
    );
    fireEvent.click(screen.getByTitle("Delete"));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("r1");
  });
});

describe("RegionsTab — Drawing mode", () => {
  it("shows 'Draw region' button when not drawing", () => {
    render(
      <RegionsTab project={makeProject()} map={makeMap()} api={makeMockApi({ drawing: false })} />,
    );
    expect(screen.getByRole("button", { name: /Draw region/ })).toBeTruthy();
  });

  it("shows drawing indicator with point count when drawing is active", () => {
    render(
      <RegionsTab
        project={makeProject()}
        map={makeMap()}
        api={makeMockApi({
          drawing: true,
          draftPoints: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
        })}
      />,
    );
    expect(screen.getByText(/Drawing.*3 pts/)).toBeTruthy();
  });
});
