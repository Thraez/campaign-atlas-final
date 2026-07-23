import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasBrowse from "@/pages/AtlasBrowse";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({
  loadAtlasContent: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "tideshore",
    title: "Tideshore",
    type: "location",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/places/tideshore.md",
    summary: "A coastal city.",
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
    worlds: [{ id: "w1", name: "Arcadia", maps: [] }],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

function renderBrowse(initialUrl: string, project: AtlasProject) {
  vi.mocked(loadAtlasContent).mockResolvedValue(project);
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <AtlasBrowse mode="browse" />
    </MemoryRouter>,
  );
}

describe("AtlasBrowse — URL filter state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores the query filter from ?q= on mount", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
      makeEntity({ id: "goblin", title: "Goblin Cave", type: "location" }),
    ]);
    renderBrowse("/atlas/browse?q=Tide", project);
    const input = await screen.findByPlaceholderText("Filter…");
    expect((input as HTMLInputElement).value).toBe("Tide");
    expect(screen.getByText("Tideshore")).toBeTruthy();
    expect(screen.queryByText("Goblin Cave")).toBeNull();
  });

  it("updates the URL without disrupting the filter when query changes", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
      makeEntity({ id: "goblin", title: "Goblin Cave", type: "location" }),
    ]);
    renderBrowse("/atlas/browse", project);
    const input = await screen.findByPlaceholderText("Filter…");
    fireEvent.change(input, { target: { value: "Goblin" } });
    expect((input as HTMLInputElement).value).toBe("Goblin");
    expect(screen.getByText("Goblin Cave")).toBeTruthy();
    expect(screen.queryByText("Tideshore")).toBeNull();
  });

  it("restores the type filter from ?type= on mount", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
      makeEntity({ id: "mira", title: "Mira", type: "npc" }),
    ]);
    renderBrowse("/atlas/browse?type=npc", project);
    await screen.findByText("Mira");
    expect(screen.queryByText("Tideshore")).toBeNull();
  });

  it("clears type filter when clicking the 'all' chip", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
      makeEntity({ id: "mira", title: "Mira", type: "npc" }),
    ]);
    renderBrowse("/atlas/browse?type=npc", project);
    await screen.findByText("Mira");
    const allBtn = screen.getByText(/^all/i, { selector: "button" });
    fireEvent.click(allBtn);
    await screen.findByText("Tideshore");
    expect(screen.getByText("Mira")).toBeTruthy();
  });
});
