/**
 * One search, three pages: the search palette, Browse and Timeline must return
 * the same entities for the same query — quoted phrases and note-text matching
 * included. Each page is driven through its real entry point (the palette as a
 * component, Browse and Timeline as routed pages reading `?q=`), so a page that
 * forks its own matching logic fails here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AtlasBrowse from "@/pages/AtlasBrowse";
import AtlasTimeline from "@/pages/AtlasTimeline";
import { SearchPalette } from "@/atlas/search/SearchPalette";
import { loadAtlasContent, type SearchIndexEntry } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({
  loadAtlasContent: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity>): Entity {
  return {
    id: "x",
    title: "X",
    type: "location",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/x.md",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
    dateValue: 1000,
    dateYear: 1000,
    dateRaw: "1000, month 1, day 1",
    ...overrides,
  } as unknown as Entity;
}

// Bodies carry markdown the way atlas.json ships them; the palette's index entries
// below carry the plain text the build derives from the same bodies.
const ENTITIES: Entity[] = [
  makeEntity({
    id: "iron-tower",
    title: "Iron Tower",
    body: "The **Iron Tower** stands near the [[ashford|old guard post]].",
  }),
  makeEntity({
    id: "silver-lake",
    title: "Silver Lake",
    body: "A still lake. The old guard walked here, posting watch.",
    dateValue: 1001,
    dateYear: 1001,
  }),
  makeEntity({ id: "ashford", title: "Ashford", summary: "A ruined keep.", dateValue: 1002 }),
];

const BODY_TEXT: Record<string, string> = {
  "iron-tower": "The Iron Tower stands near the old guard post.",
  "silver-lake": "A still lake. The old guard walked here, posting watch.",
  ashford: "",
};

// What loadSearchIndex() hands the palette: bodyText shipped, body lowercased on load.
const INDEX: SearchIndexEntry[] = ENTITIES.map((e) => ({
  id: e.id,
  title: e.title,
  type: e.type,
  aliases: e.aliases,
  tags: e.tags,
  summary: e.summary,
  bodyText: BODY_TEXT[e.id],
  searchText: BODY_TEXT[e.id].toLowerCase(),
}));

const PROJECT = {
  version: 1,
  publishedAt: null,
  worlds: [{ id: "w1", name: "Tidemarrow", maps: [] }],
  maps: [],
  entities: ENTITIES,
  placements: [],
  assets: [],
} as unknown as AtlasProject;

/** Entity ids linked from a page's results (`/atlas?entity=<id>` links). */
function linkedEntityIds(container: HTMLElement): string[] {
  const ids = new Set<string>();
  container.querySelectorAll<HTMLAnchorElement>('a[href*="entity="]').forEach((a) => {
    const id = new URL(a.getAttribute("href")!, "http://x").searchParams.get("entity");
    if (id) ids.add(id);
  });
  return [...ids].sort();
}

async function browseIds(query: string): Promise<string[]> {
  vi.mocked(loadAtlasContent).mockResolvedValue(PROJECT);
  const { container } = render(
    <MemoryRouter initialEntries={[`/atlas/browse?q=${encodeURIComponent(query)}`]}>
      <AtlasBrowse mode="browse" />
    </MemoryRouter>,
  );
  await screen.findByRole("main");
  const ids = linkedEntityIds(container);
  cleanup();
  return ids;
}

async function timelineIds(query: string): Promise<string[]> {
  vi.mocked(loadAtlasContent).mockResolvedValue(PROJECT);
  const { container } = render(
    <MemoryRouter initialEntries={[`/atlas/timeline?q=${encodeURIComponent(query)}`]}>
      <AtlasTimeline />
    </MemoryRouter>,
  );
  await screen.findByPlaceholderText("Filter events…");
  const ids = linkedEntityIds(container);
  cleanup();
  return ids;
}

function paletteIds(query: string): string[] {
  render(
    <MemoryRouter>
      <SearchPalette
        query={query}
        setQuery={vi.fn()}
        index={INDEX}
        placements={[]}
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
  const listbox = screen.queryByRole("listbox");
  const options = listbox ? within(listbox).queryAllByRole("option") : [];
  const ids = options
    .map((o) => ENTITIES.find((e) => (o.textContent ?? "").includes(e.title))?.id)
    .filter((id): id is string => !!id)
    .sort();
  cleanup();
  return ids;
}

describe("one search across the palette, Browse and Timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it.each([
    ['"old guard post"', ["iron-tower"]], // quoted phrase only in a note body (link text)
    ["posting watch", ["silver-lake"]], // unquoted words only in a note body
    ['"iron tower" near', ["iron-tower"]], // phrase plus unquoted remainder
    ["ruined", ["ashford"]], // summary
    ['""', ["ashford", "iron-tower", "silver-lake"]], // only empty quotes: like a blank query
  ])("%s returns the same entities on every page", async (query, expected) => {
    expect(paletteIds(query)).toEqual(expected);
    expect(await browseIds(query)).toEqual(expected);
    expect(await timelineIds(query)).toEqual(expected);
  });
});
