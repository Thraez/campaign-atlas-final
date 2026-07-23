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

describe("AtlasBrowse — A–Z jump rail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom doesn't implement scrollIntoView; stub it so click tests don't throw
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders an enabled button for letters that have entries", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
    ]);
    renderBrowse("/atlas/browse", project);
    await screen.findByText("Tideshore");
    // T is present → button enabled
    const tBtn = screen.getByRole("button", { name: "Jump to T" });
    expect(tBtn).not.toBeDisabled();
  });

  it("renders a disabled button for letters that have no entries", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
    ]);
    renderBrowse("/atlas/browse", project);
    await screen.findByText("Tideshore");
    // A is absent → button disabled
    const aBtn = screen.getByRole("button", { name: "Jump to A" });
    expect(aBtn).toBeDisabled();
  });

  it("clicking an active letter calls scrollIntoView on the matching section", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
    ]);
    renderBrowse("/atlas/browse", project);
    await screen.findByText("Tideshore");
    fireEvent.click(screen.getByRole("button", { name: "Jump to T" }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("renders the # bucket as active when entries start with non-letters", async () => {
    const project = makeProject([
      makeEntity({ id: "area51", title: "1st Legion", type: "faction" }),
    ]);
    renderBrowse("/atlas/browse", project);
    await screen.findByText("1st Legion");
    const hashBtn = screen.getByRole("button", { name: "Jump to #" });
    expect(hashBtn).not.toBeDisabled();
    // A should be absent
    const aBtn = screen.getByRole("button", { name: "Jump to A" });
    expect(aBtn).toBeDisabled();
  });

  it("sections carry the expected id attributes", async () => {
    const project = makeProject([
      makeEntity({ id: "tideshore", title: "Tideshore", type: "location" }),
    ]);
    renderBrowse("/atlas/browse", project);
    await screen.findByText("Tideshore");
    expect(document.getElementById("section-T")).not.toBeNull();
  });
});

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

describe("AtlasBrowse — skip link and main landmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders a <main id='browse-main'> landmark", async () => {
    renderBrowse("/atlas/browse", makeProject([makeEntity()]));
    await screen.findByText("Tideshore");
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main.id).toBe("browse-main");
  });

  it("renders a skip link targeting #browse-main", async () => {
    renderBrowse("/atlas/browse", makeProject([makeEntity()]));
    await screen.findByText("Tideshore");
    const skipLink = document.querySelector('a[href="#browse-main"]');
    expect(skipLink).not.toBeNull();
    expect(skipLink).toHaveClass("skip-to-main");
  });
});
