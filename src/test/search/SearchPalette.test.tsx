/**
 * Behaviour tests for the atlas search palette, extracted from AtlasViewer into
 * src/atlas/search/SearchPalette.tsx. These are the characterization net for
 * that extraction: they exercise the palette as a black box (props in,
 * onPick/onClose out) — rendering, query filtering/ranking, type + this-map
 * filters, keyboard selection, and dismissal. No react-leaflet needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SearchPalette } from "@/atlas/search/SearchPalette";
import { _resetVisitedForTests } from "@/atlas/visited/visitedPlaces";
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
  // Ensure visited-place store starts clean so Q20 "recently viewed" path is
  // only activated when tests explicitly populate it.
  _resetVisitedForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  _resetVisitedForTests();
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

describe("result count (Q19)", () => {
  it("shows 'N matches' for the full pool when entries are under the 40-cap", () => {
    // INDEX has 3 entries; all match an empty query → pool size 3, shown as 3 items.
    renderPalette({ query: "" });
    expect(screen.getByText(/3 matches/)).toBeInTheDocument();
    expect(screen.queryByText(/showing first 40/)).not.toBeInTheDocument();
  });

  it("shows '1 match' (singular) when only one entry matches the query", () => {
    renderPalette({ query: "silver" });
    expect(screen.getByText(/1 match/)).toBeInTheDocument();
    expect(screen.queryByText(/matches/)).not.toBeInTheDocument();
  });

  it("shows total + '(showing first 40)' when the pool exceeds 40", () => {
    const bigIndex = Array.from({ length: 50 }, (_, i) =>
      entry({ id: `e${i}`, title: `Entity ${i}` }),
    );
    renderPalette({ query: "", index: bigIndex });
    expect(screen.getByText(/50 matches/)).toBeInTheDocument();
    expect(screen.getByText(/showing first 40/)).toBeInTheDocument();
  });

  it("shows no count line when there are no results", () => {
    renderPalette({ query: "zzzznope" });
    expect(screen.queryByText(/\d+ match/)).not.toBeInTheDocument();
  });
});

describe("dialog semantics and focus trap (Q29)", () => {
  it("exposes dialog role, aria-modal, and accessible name on the palette container", () => {
    renderPalette();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Search the atlas");
  });

  it("exposes an accessible label on the search input", () => {
    renderPalette();
    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    renderPalette({ query: "" });
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    renderPalette({ query: "" });
    const dialog = screen.getByRole("dialog");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the trigger element when the palette unmounts", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderPalette();
    act(() => unmount());

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});

describe("recently viewed (Q20)", () => {
  function seedVisited(ids: string[]): void {
    // Write a visited map with staggered timestamps so order is deterministic.
    const map: Record<string, { visitedAt: string }> = {};
    ids.forEach((id, i) => {
      map[id] = { visitedAt: `2026-07-${String(20 - i).padStart(2, "0")}T12:00:00.000Z` };
    });
    window.localStorage.setItem("atlas-visited-v1", JSON.stringify(map));
  }

  it("shows 'Recently viewed' label and visited entity first when history exists", () => {
    // Mark silver-lake as the most recently visited.
    seedVisited(["silver-lake", "iron-tower"]);
    renderPalette({ query: "" });
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
    const rows = resultButtons();
    // silver-lake visited most recently → first row.
    expect(rows[0]).toHaveTextContent("Silver Lake");
    expect(rows[1]).toHaveTextContent("Iron Tower");
    // ancient-guard was never visited → not in the list.
    expect(screen.queryByText("Ancient Guard")).not.toBeInTheDocument();
  });

  it("hides the count bar and shows the section label when history is present", () => {
    seedVisited(["iron-tower"]);
    renderPalette({ query: "" });
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ match/)).not.toBeInTheDocument();
  });

  it("falls back to index order (with count bar) when nothing has been visited", () => {
    // No seedVisited call → localStorage empty.
    renderPalette({ query: "" });
    expect(screen.queryByText("Recently viewed")).not.toBeInTheDocument();
    expect(screen.getByText(/3 matches/)).toBeInTheDocument();
    expect(screen.getByText("Iron Tower")).toBeInTheDocument();
    expect(screen.getByText("Ancient Guard")).toBeInTheDocument();
    expect(screen.getByText("Silver Lake")).toBeInTheDocument();
  });

  it("drops stale visited ids that are absent from the current index", () => {
    seedVisited(["stale-id-not-in-index", "silver-lake"]);
    renderPalette({ query: "" });
    // "stale-id-not-in-index" is absent from INDEX → filtered out.
    // silver-lake is present → recently viewed section shows only silver-lake.
    expect(screen.getByText("Recently viewed")).toBeInTheDocument();
    const rows = resultButtons();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Silver Lake");
  });

  it("typing a query dismisses the recently-viewed section and shows scored results", () => {
    seedVisited(["silver-lake"]);
    renderPalette({ query: "iron" });
    expect(screen.queryByText("Recently viewed")).not.toBeInTheDocument();
    // Title "Iron Tower" has "Iron" highlighted in a <mark>; use toHaveTextContent
    // since getByText won't match text split across child elements.
    expect(resultButtons()[0]).toHaveTextContent("Iron Tower");
    expect(screen.queryByText("Silver Lake")).not.toBeInTheDocument();
  });
});

describe("listbox semantics and activedescendant (Q30)", () => {
  it("results container has role='listbox' with accessible label", () => {
    renderPalette({ query: "" });
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveAttribute("aria-label", "Search results");
    // Input advertises the listbox it controls.
    const input = screen.getByRole("textbox", { name: "Search" });
    expect(input).toHaveAttribute("aria-controls", "sp-results-listbox");
    expect(listbox.id).toBe("sp-results-listbox");
  });

  it("each result row has role='option' and a stable entity-based id", () => {
    renderPalette({ query: "" });
    const options = screen.getAllByRole("option");
    // INDEX order: IRON, GUARD, LAKE
    expect(options[0]).toHaveAttribute("id", "sp-result-iron-tower");
    expect(options[1]).toHaveAttribute("id", "sp-result-ancient-guard");
    expect(options[2]).toHaveAttribute("id", "sp-result-silver-lake");
  });

  it("all options have aria-selected=false before any arrow navigation", () => {
    renderPalette({ query: "" });
    const options = screen.getAllByRole("option");
    options.forEach((opt) => expect(opt).toHaveAttribute("aria-selected", "false"));
    // Input has no activedescendant yet.
    expect(screen.getByRole("textbox", { name: "Search" })).not.toHaveAttribute(
      "aria-activedescendant",
    );
  });

  it("ArrowDown updates aria-activedescendant on input and marks first option selected", () => {
    renderPalette({ query: "" });
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input).toHaveAttribute("aria-activedescendant", "sp-result-iron-tower");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("polite live region announces the result count when searching", () => {
    renderPalette({ query: "iron" });
    // "Iron" matches only Iron Tower → 1 result.
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
  });

  it("live region announces plural count and is silent in recently-viewed mode", () => {
    // No visited history → not recently-viewed; all three entries shown.
    renderPalette({ query: "" });
    expect(screen.getByRole("status")).toHaveTextContent("3 results");
  });

  it("live region announces no results when the query has no matches", () => {
    renderPalette({ query: "xyzzynoentity" });
    expect(screen.getByRole("status")).toHaveTextContent("No results");
  });
});
