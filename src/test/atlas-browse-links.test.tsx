/**
 * Regression: AtlasBrowse entity cards must not nest <a> inside <a>.
 *
 * Each entity card links to the entity on the map; the type badge and the tag
 * chips are ALSO links (to /atlas/type/* and /atlas/tag/*). Those chips must be
 * siblings of the card link, never descendants of it — nested anchors are
 * invalid HTML, trigger React's validateDOMNesting warning, and make the chip
 * clicks unreliable (the browser may follow the outer card link instead of the
 * chip). This guard locks in the fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AtlasBrowse from "@/pages/AtlasBrowse";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({
  loadAtlasContent: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "corven",
    title: "Corven",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: ["npc", "smuggler"],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/corven.md",
    summary: "A legendary underworld figure.",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
    ...overrides,
  } as unknown as Entity;
}

function makeProject(entities: Entity[]): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

function renderBrowse(project: AtlasProject) {
  vi.mocked(loadAtlasContent).mockResolvedValue(project);
  return render(
    <MemoryRouter initialEntries={["/atlas/browse"]}>
      <AtlasBrowse mode="browse" />
    </MemoryRouter>,
  );
}

describe("AtlasBrowse — tag facet row (Q24)", () => {
  function makeTaggedProject() {
    return makeProject([
      makeEntity({ id: "e1", title: "Aldric", type: "npc", tags: ["npc", "smuggler"], summary: "" }),
      makeEntity({ id: "e2", title: "Bridget", type: "npc", tags: ["npc", "city"], summary: "" }),
      makeEntity({ id: "e3", title: "Calder", type: "npc", tags: ["npc", "quest"], summary: "" }),
      makeEntity({
        id: "e4",
        title: "Dawnport",
        type: "location",
        tags: ["city", "port"],
        summary: "",
      }),
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a Tags: facet row in browse mode with chip links to tag pages", async () => {
    vi.mocked(loadAtlasContent).mockResolvedValue(makeTaggedProject());
    render(
      <MemoryRouter initialEntries={["/atlas/browse"]}>
        <AtlasBrowse mode="browse" />
      </MemoryRouter>,
    );
    await screen.findByText("Aldric");
    expect(screen.getByText("Tags:")).toBeInTheDocument();
    // "npc" appears on 3 entities (top by frequency); its chip links to /atlas/tag/npc
    const npcLinks = screen.getAllByRole("link", { name: "#npc" });
    expect(npcLinks.some((l) => l.getAttribute("href") === "/atlas/tag/npc")).toBe(true);
  });

  it("does not show the tag facet row in tag mode", async () => {
    vi.mocked(loadAtlasContent).mockResolvedValue(makeTaggedProject());
    render(
      <MemoryRouter initialEntries={["/atlas/tag/npc"]}>
        <Routes>
          <Route path="/atlas/tag/:tag" element={<AtlasBrowse mode="tag" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Aldric");
    expect(screen.queryByText("Tags:")).toBeNull();
  });

  it("does not show the tag facet row in type mode", async () => {
    vi.mocked(loadAtlasContent).mockResolvedValue(makeTaggedProject());
    render(
      <MemoryRouter initialEntries={["/atlas/type/npc"]}>
        <Routes>
          <Route path="/atlas/type/:type" element={<AtlasBrowse mode="type" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Aldric");
    expect(screen.queryByText("Tags:")).toBeNull();
  });

  it("shows '+N more' button when tags exceed initial cap and reveals all on click", async () => {
    // 10 unique-tag entities → 2 tags overflow TAG_FACET_INITIAL (8)
    const entities = Array.from({ length: 10 }, (_, i) =>
      makeEntity({ id: `ent${i}`, title: `Vertex${i}`, tags: [`facettag${i}`], summary: "" }),
    );
    vi.mocked(loadAtlasContent).mockResolvedValue(makeProject(entities));
    render(
      <MemoryRouter initialEntries={["/atlas/browse"]}>
        <AtlasBrowse mode="browse" />
      </MemoryRouter>,
    );
    await screen.findByText("Vertex0");
    const moreBtn = screen.getByRole("button", { name: "+2 more" });
    expect(moreBtn).toBeInTheDocument();
    fireEvent.click(moreBtn);
    expect(screen.queryByRole("button", { name: "+2 more" })).toBeNull();
    // all chips now in the facet row — spot-check one that was hidden before expand
    const facetRow = screen.getByText("Tags:").parentElement!;
    expect(within(facetRow).getAllByRole("link", { name: "#facettag8" })).toHaveLength(1);
  });
});

describe("AtlasBrowse — entity card links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not nest <a> inside <a>", async () => {
    const { container } = renderBrowse(makeProject([makeEntity()]));
    await screen.findByText("Corven");
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("links the card to the entity on the map", async () => {
    renderBrowse(makeProject([makeEntity({ id: "corven" })]));
    const card = await screen.findByRole("link", { name: /Corven/i });
    expect(card).toHaveAttribute("href", "/atlas?entity=corven");
  });

  it("renders each tag chip as a real link to its tag page", async () => {
    renderBrowse(makeProject([makeEntity({ tags: ["smuggler"] })]));
    await screen.findByText("Corven");
    const tagLinks = screen.getAllByRole("link", { name: /#smuggler/i });
    expect(tagLinks.every((l) => l.getAttribute("href") === "/atlas/tag/smuggler")).toBe(true);
  });

  it("renders the type badge as a real link to its type page", async () => {
    renderBrowse(makeProject([makeEntity({ type: "npc" })]));
    await screen.findByText("Corven");
    const typeLink = screen.getByRole("link", { name: "Person" });
    expect(typeLink).toHaveAttribute("href", "/atlas/type/npc");
  });
});
