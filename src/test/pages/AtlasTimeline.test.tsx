import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AtlasTimeline from "@/pages/AtlasTimeline";
import { loadAtlasContent } from "@/atlas/content/loader";
import type { AtlasProject, Entity } from "@/atlas/content/schema";

vi.mock("@/atlas/content/loader", () => ({
  loadAtlasContent: vi.fn(),
}));

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "battle-of-stone",
    title: "Battle of Stone Bridge",
    type: "event",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/events/battle.md",
    summary: "A pivotal battle.",
    links: [],
    backlinks: [],
    relationships: [],
    profile: {},
    dateValue: 1000,
    dateYear: 1000,
    dateRaw: "1000 AE",
    ...overrides,
  } as unknown as Entity;
}

function makeProject(entities: Entity[]): AtlasProject {
  return {
    version: 1,
    publishedAt: null,
    worlds: [{ id: "w1", name: "Tidemarrow", maps: [] }],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

function renderTimeline(project: AtlasProject, initialUrl = "/atlas/timeline") {
  vi.mocked(loadAtlasContent).mockResolvedValue(project);
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <AtlasTimeline />
    </MemoryRouter>,
  );
}

describe("AtlasTimeline — empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows onboarding copy when there are no dated entries at all", async () => {
    renderTimeline(makeProject([]));
    await screen.findByText(/No dated entries yet/i);
    expect(screen.queryByText(/No events match your filter/i)).toBeNull();
  });

  it("shows filter-no-match message when dated entries exist but filter excludes all", async () => {
    renderTimeline(makeProject([makeEntity()]));
    const input = await screen.findByPlaceholderText("Filter events…");
    fireEvent.change(input, { target: { value: "xyzzy-no-match" } });
    await screen.findByText(/No events match your filter/i);
    expect(screen.queryByText(/No dated entries yet/i)).toBeNull();
  });

  it("clear-filter button resets query and restores entries", async () => {
    renderTimeline(makeProject([makeEntity()]));
    const input = await screen.findByPlaceholderText("Filter events…");
    fireEvent.change(input, { target: { value: "xyzzy-no-match" } });
    await screen.findByText(/No events match your filter/i);
    const clearBtn = screen.getByText("Clear filter", { selector: "button" });
    fireEvent.click(clearBtn);
    await screen.findByText("Battle of Stone Bridge");
    expect(screen.queryByText(/No events match your filter/i)).toBeNull();
  });
});

describe("AtlasTimeline — URL filter state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores the query filter from ?q= on mount", async () => {
    const battle = makeEntity({ id: "battle", title: "Battle of Stone Bridge", type: "event" });
    const treaty = makeEntity({
      id: "treaty",
      title: "Treaty of Thornwall",
      type: "event",
      dateValue: 1100,
      dateYear: 1100,
      dateRaw: "1100 AE",
      summary: "A diplomatic agreement.",
    });
    renderTimeline(makeProject([battle, treaty]), "/atlas/timeline?q=Battle");
    const input = await screen.findByPlaceholderText("Filter events…");
    expect((input as HTMLInputElement).value).toBe("Battle");
    expect(screen.getByText("Battle of Stone Bridge")).toBeTruthy();
    expect(screen.queryByText("Treaty of Thornwall")).toBeNull();
  });

  it("updating the filter input keeps the view consistent", async () => {
    const battle = makeEntity({ id: "battle", title: "Battle of Stone Bridge", type: "event" });
    const treaty = makeEntity({
      id: "treaty",
      title: "Treaty of Thornwall",
      type: "event",
      dateValue: 1100,
      dateYear: 1100,
      dateRaw: "1100 AE",
      summary: "A diplomatic agreement.",
    });
    renderTimeline(makeProject([battle, treaty]));
    await screen.findByText("Battle of Stone Bridge");
    const input = screen.getByPlaceholderText("Filter events…");
    fireEvent.change(input, { target: { value: "Treaty" } });
    expect(screen.getByText("Treaty of Thornwall")).toBeTruthy();
    expect(screen.queryByText("Battle of Stone Bridge")).toBeNull();
  });

  it("the clear-X button on the input clears the query", async () => {
    const battle = makeEntity();
    renderTimeline(makeProject([battle]), "/atlas/timeline?q=Battle");
    const input = await screen.findByPlaceholderText("Filter events…");
    expect((input as HTMLInputElement).value).toBe("Battle");
    const clearX = screen.getByLabelText("Clear filter");
    fireEvent.click(clearX);
    expect((input as HTMLInputElement).value).toBe("");
  });
});

describe("AtlasTimeline — skip link and main landmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a <main id='timeline-main'> landmark", async () => {
    renderTimeline(makeProject([makeEntity()]));
    await screen.findByText("Battle of Stone Bridge");
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main.id).toBe("timeline-main");
  });

  it("renders a skip link targeting #timeline-main", async () => {
    renderTimeline(makeProject([makeEntity()]));
    await screen.findByText("Battle of Stone Bridge");
    const skipLink = document.querySelector('a[href="#timeline-main"]');
    expect(skipLink).not.toBeNull();
    expect(skipLink).toHaveClass("skip-to-main");
  });
});
