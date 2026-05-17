import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import type { Entity } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id, title: p.title, type: p.type ?? "npc", visibility: p.visibility ?? "player",
    aliases: [], tags: [], images: [], body: p.body ?? "", bodyHtml: "",
    frontmatter: {}, sourcePath: "", links: [], backlinks: [],
  } as Entity;
}

describe("EntityReadingView", () => {
  it("renders the projected bio for a hidden entity (works pre-publish)", () => {
    const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
      body: "Public.\n\n%%\nsecret\n%%\n" });
    // Player mode: stripping + visibility banner.
    localStorage.setItem("atlas.viewMode", "player");
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.getByText(/not yet visible to players/i)).toBeInTheDocument();
  });
  it("omits the visibility note for a player-visible entity", () => {
    localStorage.clear();
    const e = ent({ id: "edric", title: "Edric", visibility: "player", body: "Hi." });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={e} entitiesById={new Map([[e.id, e]])} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/not yet visible to players/i)).not.toBeInTheDocument();
  });
  it("dm lens shows raw DM content; player lens hides it", () => {
    const corven = ent({ id: "corven", title: "Corven", visibility: "dm",
      body: "Public.\n\n%%\nsecret truth\n%%\n" });
    // Default lens = dm → secret visible.
    localStorage.clear();
    const { unmount } = render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
        </ViewModeProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/secret truth/)).toBeInTheDocument();
    unmount();
    // Force player lens via storage.
    localStorage.setItem("atlas.viewMode", "player");
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
        </ViewModeProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText(/secret truth/)).not.toBeInTheDocument();
  });
});
