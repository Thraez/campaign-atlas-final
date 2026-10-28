import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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
    // Shaped like what the real no-calendar pipeline emits (calendarDate.ts),
    // not a tidy "1000 AE" the vault never actually produces.
    dateLabel: "1000, month 1, day 1",
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
      dateLabel: "1100, month 2, day 14",
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
      dateLabel: "1100, month 2, day 14",
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

describe("AtlasTimeline — year groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  const titlesIn = (heading: string) => {
    const group = screen.getByRole("heading", { level: 2, name: heading }).closest("li")!;
    return Array.from(group.querySelectorAll("a")).map(
      (a) => a.querySelector(".font-medium")?.textContent,
    );
  };

  it("files an event with no year under its own Undated group, not under 0", async () => {
    const dated = makeEntity({ id: "battle", title: "Battle", dateValue: 1000, dateYear: 1000 });
    const flood = makeEntity({
      id: "flood",
      title: "The Flood",
      dateValue: 500,
      dateYear: undefined,
      dateLabel: "Year of the Flood",
    });
    renderTimeline(makeProject([dated, flood]));
    await screen.findByText("The Flood");
    expect(headings()).toEqual(["1000", "Undated"]);
    expect(titlesIn("Undated")).toEqual(["The Flood"]);
  });

  it("keeps a year-0 event under 0, not Undated", async () => {
    const founding = makeEntity({
      id: "founding",
      title: "Founding",
      dateValue: 1,
      dateYear: 0,
      dateLabel: "0",
    });
    const flood = makeEntity({
      id: "flood",
      title: "The Flood",
      dateValue: 500,
      dateYear: undefined,
      dateLabel: "Year of the Flood",
    });
    renderTimeline(makeProject([flood, founding]));
    await screen.findByText("Founding");
    expect(headings()).toEqual(["0", "Undated"]);
    expect(titlesIn("0")).toEqual(["Founding"]);
    expect(titlesIn("Undated")).toEqual(["The Flood"]);
  });

  it("keeps year groups in year order when a dateValue override crosses years", async () => {
    // The 1100 event's override sorts it before every 1000 event by value.
    const early = makeEntity({ id: "a", title: "Early", dateValue: 1000, dateYear: 1000 });
    const late = makeEntity({ id: "b", title: "Late", dateValue: 1200, dateYear: 1000 });
    const override = makeEntity({ id: "c", title: "Overridden", dateValue: 5, dateYear: 1100 });
    renderTimeline(makeProject([late, override, early]));
    await screen.findByText("Overridden");
    expect(headings()).toEqual(["1000", "1100"]);
    expect(titlesIn("1000")).toEqual(["Early", "Late"]);
  });
});
