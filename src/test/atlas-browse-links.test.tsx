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
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    const tagLink = screen.getByRole("link", { name: /#smuggler/i });
    expect(tagLink).toHaveAttribute("href", "/atlas/tag/smuggler");
  });

  it("renders the type badge as a real link to its type page", async () => {
    renderBrowse(makeProject([makeEntity({ type: "npc" })]));
    await screen.findByText("Corven");
    const typeLink = screen.getByRole("link", { name: "Person" });
    expect(typeLink).toHaveAttribute("href", "/atlas/type/npc");
  });
});
