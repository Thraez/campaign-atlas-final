/**
 * Behaviour tests for the atlas search palette, extracted from AtlasViewer into
 * src/atlas/search/SearchPalette.tsx. These are the characterization net for
 * that extraction: they exercise the palette as a black box (props in,
 * onPick/onClose out) — rendering, query filtering/ranking, type + this-map
 * filters, keyboard selection, and dismissal. No react-leaflet needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchPalette } from "@/atlas/search/SearchPalette";
import type { SearchIndexEntry } from "@/atlas/content/loader";
import type { MapPlacement } from "@/atlas/content/schema";

function entry(overrides: Partial<SearchIndexEntry> = {}): SearchIndexEntry {
  return {
    id: "e",
    title: "Entry",
    type: "location",
    aliases: [],
    tags: [],
    body: "",
    bodyText: "",
    ...overrides,
  };
}

const IRON = entry({
  id: "iron-tower",
  title: "Iron Tower",
  type: "location",
  tags: ["ruins"],
  body: "the iron tower stands tall",
  bodyText: "The Iron Tower stands tall",
});
const GUARD = entry({
  id: "ancient-guard",
  title: "Ancient Guard",
  type: "npc",
  tags: ["ruins"],
  body: "a weathered sentinel",
  bodyText: "A weathered sentinel",
});
const LAKE = entry({
  id: "silver-lake",
  title: "Silver Lake",
  type: "location",
  tags: ["water"],
  body: "a still silver lake",
  bodyText: "A still silver lake",
});

const INDEX = [IRON, GUARD, LAKE];

// Only Iron Tower is placed on the current map.
const PLACEMENTS: MapPlacement[] = [
  { entityId: "iron-tower", mapId: "m1", x: 10, y: 10 } as MapPlacement,
];

function renderPalette(
  overrides: {
    query?: string;
    setQuery?: (q: string) => void;
    onPick?: (id: string, fly: boolean) => void;
    onClose?: () => void;
    index?: SearchIndexEntry[];
    placements?: MapPlacement[];
  } = {},
) {
  return render(
    <MemoryRouter>
      <SearchPalette
        query={overrides.query ?? ""}
        setQuery={overrides.setQuery ?? vi.fn()}
        index={overrides.index ?? INDEX}
        placements={overrides.placements ?? PLACEMENTS}
        onPick={overrides.onPick ?? vi.fn()}
        onClose={overrides.onClose ?? vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** Grab the scrollable results list (the last child of the card). */
function resultButtons(): HTMLElement[] {
  const list = document.querySelector(".max-h-\\[60vh\\]") as HTMLElement;
  return Array.from(list.querySelectorAll("button[data-index]")) as HTMLElement[];
}

beforeEach(() => {
  // The "recently revealed" hook fetches atlas.json + the publish baseline on
  // mount. Return not-ok so the filter stays unavailable and tests are
  // deterministic (the "recent" chip is then absent).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false }) as Response),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SearchPalette", () => {
  it("lists every index entry when the query is empty", () => {
    renderPalette({ query: "" });
    expect(screen.getByText("Iron Tower")).toBeInTheDocument();
    expect(screen.getByText("Ancient Guard")).toBeInTheDocument();
    expect(screen.getByText("Silver Lake")).toBeInTheDocument();
  });

  it("filters to matching entries and ranks a title match first", () => {
    renderPalette({ query: "silver" });
    const rows = resultButtons();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Silver Lake");
    expect(screen.queryByText("Iron Tower")).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderPalette({ query: "zzzznope" });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
    expect(resultButtons()).toHaveLength(0);
  });

  it("calls onPick with the entity id and its placed flag when a result is clicked", () => {
    const onPick = vi.fn();
    renderPalette({ query: "", onPick });
    fireEvent.click(screen.getByText("Iron Tower"));
    // Iron Tower is in PLACEMENTS → placed flag is true.
    expect(onPick).toHaveBeenCalledWith("iron-tower", true);
  });

  it("passes placed=false for an entity that is not on the current map", () => {
    const onPick = vi.fn();
    renderPalette({ query: "", onPick });
    fireEvent.click(screen.getByText("Silver Lake"));
    expect(onPick).toHaveBeenCalledWith("silver-lake", false);
  });

  it("narrows results to a single type when a type chip is toggled", () => {
    renderPalette({ query: "" });
    // location(2) + npc(1) → the type-filter row renders. npc's label is "Person".
    fireEvent.click(screen.getByRole("button", { name: /^Person\b/ }));
    const rows = resultButtons();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Ancient Guard");
  });

  it("restricts results to placed entities when 'this map only' is on", () => {
    renderPalette({ query: "" });
    fireEvent.click(screen.getByRole("button", { name: /all maps/i }));
    const rows = resultButtons();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Iron Tower");
  });

  it("selects with ArrowDown and commits with Enter", () => {
    const onPick = vi.fn();
    renderPalette({ query: "", onPick });
    const input = screen.getByPlaceholderText(/Search titles/i);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // First row (index order) is Iron Tower, which is placed.
    expect(onPick).toHaveBeenCalledWith("iron-tower", true);
  });

  it("reports typing through setQuery (controlled input)", () => {
    const setQuery = vi.fn();
    renderPalette({ query: "", setQuery });
    fireEvent.change(screen.getByPlaceholderText(/Search titles/i), {
      target: { value: "iron" },
    });
    expect(setQuery).toHaveBeenCalledWith("iron");
  });

  it("calls onClose when the backdrop is clicked but not when the card is", () => {
    const onClose = vi.fn();
    const { container } = renderPalette({ query: "", onClose });
    const backdrop = container.querySelector(".fixed.inset-0") as HTMLElement;
    // Clicking inside the card must not close (stopPropagation).
    fireEvent.click(within(backdrop).getByPlaceholderText(/Search titles/i));
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the backdrop itself closes.
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
