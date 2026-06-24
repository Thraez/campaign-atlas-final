import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { CreditsConfig, Entity, MapPlacement } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";

const e: Entity = {
  id: "corven", title: "Corven", type: "npc", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "<p>Bio body</p>",
  frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity;

const ally: Entity = {
  id: "ally-npc", title: "Ally NPC", type: "npc", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "",
  frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity;

const baseEntityById = new Map([[e.id, e], [ally.id, ally]]);

const renderPanel = (readerAffordances?: boolean) =>
  render(
    <MemoryRouter>
      <EntityPanel
        entity={e}
        placements={[]}
        entityById={new Map([[e.id, e]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        readerAffordances={readerAffordances}
      />
    </MemoryRouter>,
  );

describe("EntityPanel (shared)", () => {
  it("renders the entity bio", () => {
    renderPanel();
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.getByText("Bio body")).toBeInTheDocument();
  });
  it("hides player-personal notes + handout when readerAffordances=false", () => {
    renderPanel(false);
    expect(screen.queryByLabelText(/handout as PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/my notes/i)).not.toBeInTheDocument();
  });
  it("shows them by default (player site unchanged)", () => {
    renderPanel(true);
    expect(screen.getByLabelText(/handout as PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/my notes/i)).toBeInTheDocument();
  });
});

describe("EntityPanel — Connections section", () => {
  it("shows no Connections section when relationships is absent", () => {
    renderPanel();
    expect(screen.queryByTestId("connections-section")).not.toBeInTheDocument();
  });

  it("shows no Connections section when relationships is empty", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("connections-section")).not.toBeInTheDocument();
  });

  it("renders Connections section with a player-visible relationship", () => {
    const rel: EntityRelationship = { entity: "ally-npc", type: "allied_with", visibility: "player" };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("connections-section")).toBeInTheDocument();
    expect(screen.getByText("Ally NPC")).toBeInTheDocument();
    expect(screen.queryByText("(DM)")).not.toBeInTheDocument();
  });

  it("shows (DM) badge on dm-visibility relationships", () => {
    const rel: EntityRelationship = { entity: "ally-npc", type: "secret_enemy", label: "Secret Foe", visibility: "dm" };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("(DM)")).toBeInTheDocument();
    expect(screen.getByText("Ally NPC")).toBeInTheDocument();
  });

  it("prefers label over type when both present", () => {
    const rel: EntityRelationship = { entity: "ally-npc", type: "allied_with", label: "Close Ally", visibility: "player" };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Close Ally:/)).toBeInTheDocument();
    expect(screen.queryByText(/allied_with/)).not.toBeInTheDocument();
  });

  it("degrades gracefully when target id is unresolved — shows raw id, no crash", () => {
    const rel: EntityRelationship = { entity: "unknown-ghost-id", type: "haunts", visibility: "player" };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={new Map([[e.id, e]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("connections-section")).toBeInTheDocument();
    expect(screen.getByText("unknown-ghost-id")).toBeInTheDocument();
  });

  it("calls onOpenEntity with the target id when a Connections entry is clicked", () => {
    const rel: EntityRelationship = { entity: "ally-npc", type: "allied_with", visibility: "player" };
    const onOpenEntity = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={onOpenEntity}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    screen.getByText("Ally NPC").click();
    expect(onOpenEntity).toHaveBeenCalledWith("ally-npc");
  });
});

// ── L1 — Credit badge ────────────────────────────────────────────────────────

const entityWithImage: Entity = {
  ...e,
  images: ["thumb.png"],
  credit: "Art by Jane Doe",
} as Entity;

function renderWithBadge(opts: { credit?: string | undefined; credits?: CreditsConfig } = {}) {
  const entity = {
    ...entityWithImage,
    credit: "credit" in opts ? opts.credit : entityWithImage.credit,
  } as Entity;
  return render(
    <MemoryRouter>
      <EntityPanel
        entity={entity}
        placements={[]}
        entityById={new Map([[entity.id, entity]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        credits={opts.credits}
      />
    </MemoryRouter>,
  );
}

describe("EntityPanel — credit badge", () => {
  it("renders badge when entity has credit and badges are not disabled", () => {
    renderWithBadge();
    expect(screen.getByRole("note", { name: /Image credit: Art by Jane Doe/i })).toBeInTheDocument();
  });

  it("hides badge when credits.badges is false", () => {
    renderWithBadge({ credits: { badges: false } });
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("no badge when entity has no credit field", () => {
    renderWithBadge({ credit: undefined });
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("no badge when entity has no images (images.length === 0 guard)", () => {
    const entity = { ...entityWithImage, images: [] } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("renders a badge on each image when entity has multiple images", () => {
    const entity = { ...entityWithImage, images: ["img1.png", "img2.png"] } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    const badges = screen.getAllByRole("note", { name: /Image credit: Art by Jane Doe/i });
    expect(badges).toHaveLength(2);
  });
});

// ── N47 — hover-peek prop bindings ───────────────────────────────────────────

const entityWithBacklink: Entity = {
  ...e,
  backlinks: [{ id: "ally-npc", title: "Ally NPC" }],
} as Entity;

const entityWithRelationship: Entity = {
  ...e,
  relationships: [{ entity: "ally-npc", type: "allied_with", visibility: "player" as const }],
} as Entity;

describe("EntityPanel — hover-peek prop bindings (N47)", () => {
  it("calls onPeek with backlink id + rect on mouseEnter", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseEnter(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on mouseLeave from a backlink button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseLeave(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });

  it("calls onPeek with backlink id on focus", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on blur from a backlink button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.blur(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });

  it("calls onPeek with Connection entity id + rect on mouseEnter", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithRelationship}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseEnter(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on mouseLeave from a Connections entry button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithRelationship}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseLeave(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });
});

// ── N76 — structural / interaction branches ──────────────────────────────────

describe("EntityPanel — null entity empty state (N76)", () => {
  it("renders the 'select a pin' prompt when entity is null", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={null}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/select a pin/i)).toBeInTheDocument();
  });
});

describe("EntityPanel — header fields (N76)", () => {
  it("renders entity.summary as a quoted paragraph", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, summary: "A shadowy figure." }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("A shadowy figure.")).toBeInTheDocument();
  });

  it("renders entity.aliases as 'aka ...'", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, aliases: ["The Shadow", "Shade"] }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/aka The Shadow, Shade/)).toBeInTheDocument();
  });

  it("renders the 'Rumored' badge when entity.visibility is 'rumor'", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, visibility: "rumor" as const }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/rumored/i)).toBeInTheDocument();
  });

  it("includes entity.race in the type kicker when both type and race are set", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, race: "Human" } as Entity}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    // playerTypeLabel("npc") === "Person"
    expect(screen.getByText("Person · Human")).toBeInTheDocument();
  });

  it("renders entity.tags as # links", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, tags: ["kingdom", "rival"] }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("#kingdom")).toBeInTheDocument();
    expect(screen.getByText("#rival")).toBeInTheDocument();
  });
});

describe("EntityPanel — placement and onShowOnMap (N76)", () => {
  const p: MapPlacement = {
    id: "pin1",
    entityId: "corven",
    mapId: "world-map",
    x: 50,
    y: 75,
    visibility: "player",
  };

  it("renders 'Show on map' button when placements is non-empty", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[p]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/show on map/i)).toBeInTheDocument();
  });

  it("calls onShowOnMap with the placement object when 'Show on map' is clicked", () => {
    const onShowOnMap = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[p]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={onShowOnMap}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText(/show on map/i));
    expect(onShowOnMap).toHaveBeenCalledWith(p);
  });
});

describe("EntityPanel — onClose callback (N76)", () => {
  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={onClose}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText(/close panel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
