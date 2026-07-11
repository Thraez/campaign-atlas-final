import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasCredits from "@/pages/AtlasCredits";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity, World } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({
  loadAtlasContent: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "test-entity",
    title: "Test Entity",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/test.md",
    links: [],
    backlinks: [],
    ...overrides,
  } as unknown as Entity;
}

function makeProject(entities: Entity[], world?: Partial<World>): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: world ? [world as World] : [],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

function renderCredits(project: AtlasProject) {
  vi.mocked(loadAtlasContent).mockResolvedValue(project);
  return render(
    <MemoryRouter initialEntries={["/atlas/credits"]}>
      <AtlasCredits />
    </MemoryRouter>,
  );
}

describe("AtlasCredits page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no entities have a credit", async () => {
    renderCredits(makeProject([makeEntity()]));
    await screen.findByText(/No image credits/i);
  });

  it("lists a credited entity alphabetically", async () => {
    renderCredits(makeProject([
      makeEntity({ id: "beta", title: "Beta", credit: "Art by B" }),
      makeEntity({ id: "alpha", title: "Alpha", credit: "Art by A" }),
    ]));
    await screen.findByText("Alpha");
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Alpha");
    expect(items[1].textContent).toContain("Beta");
  });

  it("does not list entities without a credit", async () => {
    renderCredits(makeProject([
      makeEntity({ id: "credited", title: "Credited", credit: "Art by X" }),
      makeEntity({ id: "uncredited", title: "Uncredited" }),
    ]));
    await screen.findByText("Credited");
    expect(screen.queryByText("Uncredited")).not.toBeInTheDocument();
  });

  it("SECRECY REGRESSION: dm-only entity credit absent from credits page", async () => {
    renderCredits(makeProject([
      makeEntity({ id: "dm-secret", title: "DM Secret", visibility: "dm", credit: "DM_CREDIT_LEAK" }),
      makeEntity({ id: "public-npc", title: "Public NPC", credit: "Art by P" }),
    ]));
    await screen.findByText("Public NPC");
    expect(screen.queryByText(/DM_CREDIT_LEAK/)).not.toBeInTheDocument();
    expect(screen.queryByText("DM Secret")).not.toBeInTheDocument();
  });
});
