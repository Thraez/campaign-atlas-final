import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Entity } from "@/atlas/content/schema";
import { ReadingPanelWelcome } from "@/atlas/entity/ReadingPanelWelcome";
import { pickStarters } from "@/atlas/entity/pickStarters";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { MemoryRouter } from "react-router-dom";

afterEach(cleanup);

function ent(over: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    type: "note",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: `content/w/${over.id}.md`,
    links: [],
    backlinks: [],
    ...over,
  } as Entity;
}

describe("pickStarters", () => {
  const none = () => false;

  it("skips entries with no summary — a starter must land on something written", () => {
    const picked = pickStarters(
      [ent({ id: "bare", title: "Bare" }), ent({ id: "written", title: "Written", summary: "A." })],
      none,
    );
    expect(picked.map((e) => e.id)).toEqual(["written"]);
  });

  it("prefers entries that are on the map", () => {
    const picked = pickStarters(
      [
        ent({ id: "off", title: "Off map", summary: "A." }),
        ent({ id: "on", title: "On map", summary: "B." }),
      ],
      (id) => id === "on",
      1,
    );
    expect(picked.map((e) => e.id)).toEqual(["on"]);
  });

  it("prefers entries with an image when placement is equal", () => {
    const picked = pickStarters(
      [
        ent({ id: "plain", title: "Plain", summary: "A." }),
        ent({ id: "illustrated", title: "Illustrated", summary: "B.", images: ["a.png"] }),
      ],
      none,
      1,
    );
    expect(picked.map((e) => e.id)).toEqual(["illustrated"]);
  });

  it("breaks ties by title so the panel is stable between loads", () => {
    const picked = pickStarters(
      [
        ent({ id: "b", title: "Beta", summary: "x" }),
        ent({ id: "a", title: "Alpha", summary: "x" }),
      ],
      none,
    );
    expect(picked.map((e) => e.title)).toEqual(["Alpha", "Beta"]);
  });

  it("caps at three by default and copes with an empty world", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      ent({ id: `e${i}`, title: `E${i}`, summary: "s" }),
    );
    expect(pickStarters(many, none)).toHaveLength(3);
    expect(pickStarters([], none)).toEqual([]);
  });
});

describe("ReadingPanelWelcome", () => {
  it("greets with the world's name instead of an instruction", () => {
    render(
      <ReadingPanelWelcome worldName="Astrath Deeprealm" starters={[]} onOpenEntity={vi.fn()} />,
    );
    expect(screen.getByText("Astrath Deeprealm")).toBeInTheDocument();
    expect(screen.queryByText(/Select a pin or search/i)).toBeNull();
  });

  it("opens the entry the reader picks", () => {
    const onOpen = vi.fn();
    render(
      <ReadingPanelWelcome
        worldName="W"
        starters={[ent({ id: "vaultgate", title: "Vaultgate", summary: "The way in." })]}
        onOpenEntity={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Vaultgate/ }));
    expect(onOpen).toHaveBeenCalledWith("vaultgate");
  });

  it("still offers the search hint when there are no starters to show", () => {
    render(<ReadingPanelWelcome worldName="W" starters={[]} onOpenEntity={vi.fn()} />);
    expect(screen.queryByText(/Start anywhere/i)).toBeNull();
    expect(screen.getByText(/to search/i)).toBeInTheDocument();
  });
});

describe("EntityPanel empty state", () => {
  const base = {
    entity: null,
    placements: [],
    entityById: new Map<string, Entity>(),
    onOpenEntity: vi.fn(),
    onClose: vi.fn(),
    onShowOnMap: vi.fn(),
  };

  it("renders the host's empty state when one is supplied", () => {
    render(
      <MemoryRouter>
        <EntityPanel {...base} emptyState={<div data-testid="custom">Welcome</div>} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    expect(screen.queryByText(/Select a pin or search/i)).toBeNull();
  });

  it("falls back to the plain prompt when no empty state is supplied", () => {
    render(
      <MemoryRouter>
        <EntityPanel {...base} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Select a pin or search/i)).toBeInTheDocument();
  });
});
