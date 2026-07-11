import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import type { Entity, MapPlacement } from "@/atlas/content/schema";

function ent(p: Partial<Entity> & { id: string; title: string }): Entity {
  return {
    id: p.id,
    title: p.title,
    type: p.type ?? "npc",
    visibility: p.visibility ?? "player",
    aliases: p.aliases ?? [],
    tags: [],
    images: [],
    body: p.body ?? "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "",
    links: [],
    backlinks: [],
  } as Entity;
}

function placement(p: { id: string; entityId: string; mapId: string }): MapPlacement {
  return { id: p.id, entityId: p.entityId, mapId: p.mapId, x: 100, y: 200, visibility: "player" };
}

describe("EntityReadingView", () => {
  it("renders the projected bio for a hidden entity (works pre-publish)", () => {
    const corven = ent({
      id: "corven",
      title: "Corven",
      visibility: "dm",
      body: "Public.\n\n%%\nsecret\n%%\n",
    });
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
    const corven = ent({
      id: "corven",
      title: "Corven",
      visibility: "dm",
      body: "Public.\n\n%%\nsecret truth\n%%\n",
    });
    // Default lens = dm → secret visible.
    localStorage.clear();
    const { unmount } = render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={corven} entitiesById={new Map([[corven.id, corven]])} />
        </ViewModeProvider>
      </MemoryRouter>,
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
      </MemoryRouter>,
    );
    expect(screen.queryByText(/secret truth/)).not.toBeInTheDocument();
  });

  it("DM mode resolves wikilinks by entity title", () => {
    localStorage.clear();
    const edric = ent({ id: "edric", title: "Edric" });
    const corven = ent({ id: "corven", title: "Corven", body: "Talk to [[Edric]] for details." });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView
            entity={corven}
            entitiesById={
              new Map([
                [edric.id, edric],
                [corven.id, corven],
              ])
            }
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    // "Edric" appears as the resolved wikilink text in Corven's rendered body (not in any header).
    expect(screen.getByText("Edric")).toBeInTheDocument();
  });

  it("DM mode resolves wikilinks via entity alias", () => {
    localStorage.clear();
    const edric = ent({ id: "edric", title: "Edric", aliases: ["Ed"] });
    const corven = ent({ id: "corven", title: "Corven", body: "Ask [[Ed]] about it." });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView
            entity={corven}
            entitiesById={
              new Map([
                [edric.id, edric],
                [corven.id, corven],
              ])
            }
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    // "Ed" is the wikilink display text, resolved via the alias map to edric's id.
    expect(screen.getByText("Ed")).toBeInTheDocument();
  });

  it("rumor entity in player mode has no 'not yet visible' banner", () => {
    localStorage.setItem("atlas.viewMode", "player");
    const ghost = ent({
      id: "ghost",
      title: "Ghost NPC",
      visibility: "rumor",
      body: "Whispers say...",
    });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={ghost} entitiesById={new Map([[ghost.id, ghost]])} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    // "rumor" is in PLAYER_VISIBLE so the pre-publish warning banner must be absent.
    expect(screen.queryByText(/not yet visible to players/i)).not.toBeInTheDocument();
  });

  it("empty body renders entity title without crashing", () => {
    localStorage.clear();
    const e = ent({ id: "mage", title: "Silent Mage", body: "" });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={e} entitiesById={new Map([[e.id, e]])} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Silent Mage")).toBeInTheDocument();
  });

  it("onClose fires when the close panel button is clicked", () => {
    localStorage.clear();
    const handleClose = vi.fn();
    const e = ent({ id: "npc1", title: "Some NPC" });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={e} entitiesById={new Map([[e.id, e]])} onClose={handleClose} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close panel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("placements prop renders a 'Show on map' button per placement", () => {
    localStorage.clear();
    const e = ent({ id: "npc1", title: "Some NPC" });
    const p = placement({ id: "p1", entityId: "npc1", mapId: "map1" });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={e} entitiesById={new Map([[e.id, e]])} placements={[p]} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /show on map/i })).toBeInTheDocument();
  });

  it("onShowOnMap fires with the correct placement when 'Show on map' is clicked", () => {
    localStorage.clear();
    const handleShowOnMap = vi.fn();
    const e = ent({ id: "npc1", title: "Some NPC" });
    const p = placement({ id: "p1", entityId: "npc1", mapId: "map1" });
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView
            entity={e}
            entitiesById={new Map([[e.id, e]])}
            placements={[p]}
            onShowOnMap={handleShowOnMap}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    expect(handleShowOnMap).toHaveBeenCalledWith(p);
  });
});
