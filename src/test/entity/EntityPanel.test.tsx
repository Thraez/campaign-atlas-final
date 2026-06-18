import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { CreditsConfig, Entity } from "@/atlas/content/schema";
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
});
