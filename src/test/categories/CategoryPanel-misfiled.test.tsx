import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Entity } from "@/atlas/content/schema";
import { CategoryPanel } from "@/atlas/categories/CategoryPanel";

afterEach(cleanup);

function ent(over: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    type: "",
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

// Mirrors the real world that surfaced this: three notes tagged #npc, no types.
const NOTES = [
  ent({ id: "corven", title: "Corven", type: "note", tags: ["smuggler", "npc"] }),
  ent({ id: "edric", title: "Edric", type: "note", tags: ["npc"] }),
  ent({ id: "soreth", title: "Soreth", type: "note", tags: [] }),
];

function renderPanel(entities: Entity[], onFileAs?: (id: string, t: string) => void) {
  return render(
    <CategoryPanel
      category="characters"
      entities={entities}
      onOpen={vi.fn()}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onFileAs={onFileAs}
    />,
  );
}

describe("CategoryPanel misfiled notice", () => {
  it("does not claim the section is empty when tagged notes belong here", () => {
    renderPanel(NOTES, vi.fn());
    expect(screen.queryByText(/No characters yet/i)).toBeNull();
    expect(screen.getByTestId("misfiled-notice")).toBeInTheDocument();
    expect(screen.getByText("2 notes look like characters.")).toBeInTheDocument();
  });

  it("lists only the notes whose tags point at this category", () => {
    renderPanel(NOTES, vi.fn());
    const notice = screen.getByTestId("misfiled-notice");
    expect(notice.textContent).toContain("Corven");
    expect(notice.textContent).toContain("Edric");
    // Soreth has no type-shaped tag, so there is nothing to suggest.
    expect(notice.textContent).not.toContain("Soreth");
  });

  it("uses singular wording for a single note", () => {
    renderPanel([NOTES[0]], vi.fn());
    expect(screen.getByText("One note looks like a character.")).toBeInTheDocument();
  });

  it("reports the entity id and suggested type when re-filing is requested", () => {
    const onFileAs = vi.fn();
    renderPanel(NOTES, onFileAs);
    fireEvent.click(screen.getAllByRole("button", { name: "File as Character" })[0]);
    expect(onFileAs).toHaveBeenCalledWith("corven", "npc");
  });

  it("shows the plain empty state when the world really has nothing here", () => {
    renderPanel([ent({ id: "soreth", title: "Soreth", type: "note" })], vi.fn());
    expect(screen.queryByTestId("misfiled-notice")).toBeNull();
    expect(screen.getByText(/No characters yet/i)).toBeInTheDocument();
  });

  it("hides the affordance entirely when the host cannot re-file", () => {
    renderPanel(NOTES, undefined);
    expect(screen.queryByTestId("misfiled-notice")).toBeNull();
  });

  it("leaves correctly typed entities out of the notice", () => {
    renderPanel([ent({ id: "vane", title: "Vane", type: "npc", tags: ["npc"] })], vi.fn());
    expect(screen.queryByTestId("misfiled-notice")).toBeNull();
    expect(screen.getByText("Vane")).toBeInTheDocument();
  });
});
