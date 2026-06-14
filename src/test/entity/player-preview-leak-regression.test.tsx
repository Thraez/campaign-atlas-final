/**
 * G1 — Mandatory leak-regression test: "honest player preview"
 *
 * Constructs an entity carrying every DM channel and asserts the
 * player-preview render exposes none of them while the DM render still does.
 *
 * Channels under test:
 *   1. %%dm%% body block       — "DM_BLOCK_SECRET"
 *   2. profile.dm field         — "DM_PROFILE_SECRET" (not rendered in DOM but verified in entity data)
 *   3. visibility:dm relationship label — "DM_RELATION_SECRET" (not rendered in DOM)
 *   4. [[DM-only entity]] link  — "Secret Villain" (DM entity title; redacted → '…')
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import { EntityPanes } from "@/atlas/entity/EntityPanes";
import { EntityReadingView } from "@/atlas/entity/EntityReadingView";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";

// A DM-only entity referenced via wikilink in the body (channel 4).
const dmEntity: Entity = {
  id: "secret-villain",
  title: "Secret Villain",
  type: "npc",
  visibility: "dm",
  aliases: [],
  tags: [],
  images: [],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "villain.md",
  links: [],
  backlinks: [],
};

// Entity under test — carries all 4 DM channels.
const leakTestEntity: Entity = {
  id: "test-npc",
  title: "Test NPC",
  type: "npc",
  visibility: "player",
  aliases: [],
  tags: [],
  images: [],
  // Channel 1: %%...%% dm block, Channel 4: [[Secret Villain]] wikilink to dm entity
  body: "Public content.\n\n%%\nDM_BLOCK_SECRET\n%%\n\nMeet [[Secret Villain]] — or so they say.",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "test-npc.md",
  links: [],
  backlinks: [],
  // Channel 2: profile.dm field
  profile: { dm: { secret: "DM_PROFILE_SECRET" } },
  // Channel 3: relationship with visibility "dm"
  relationships: [
    { entity: "secret-villain", type: "ally", label: "DM_RELATION_SECRET", visibility: "dm" },
  ] as EntityRelationship[],
};

const entitiesById = new Map([
  [leakTestEntity.id, leakTestEntity],
  [dmEntity.id, dmEntity],
]);

// ── Unit layer ────────────────────────────────────────────────────────────────

describe("G1 — projectEntityForPlayer: all 4 DM channels stripped from entity data", () => {
  it("strips the %%dm%% body block (channel 1)", () => {
    const projected = projectEntityForPlayer(leakTestEntity, buildProjectionContext(entitiesById));
    expect(projected.body).not.toContain("DM_BLOCK_SECRET");
  });

  it("removes profile.dm field (channel 2)", () => {
    const projected = projectEntityForPlayer(leakTestEntity, buildProjectionContext(entitiesById));
    expect(projected.profile?.dm).toBeUndefined();
  });

  it("filters out visibility:dm relationship (channel 3)", () => {
    const projected = projectEntityForPlayer(leakTestEntity, buildProjectionContext(entitiesById));
    const labels = (projected.relationships ?? []).map((r) => r.label);
    expect(labels).not.toContain("DM_RELATION_SECRET");
  });

  it("redacts [[DM-only entity]] link — title absent from body and bodyHtml (channel 4)", () => {
    const projected = projectEntityForPlayer(leakTestEntity, buildProjectionContext(entitiesById));
    expect(projected.body).not.toContain("Secret Villain");
    expect(projected.bodyHtml).not.toContain("Secret Villain");
  });
});

// ── EntityReadingView integration layer ──────────────────────────────────────

describe("G1 — EntityReadingView render: player mode hides DM content", () => {
  beforeEach(() => localStorage.setItem("atlas.viewMode", "player"));
  afterEach(() => localStorage.clear());

  it("DM body block absent from DOM in player mode (channel 1)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={leakTestEntity} entitiesById={entitiesById} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(document.body.textContent).not.toContain("DM_BLOCK_SECRET");
  });

  it("DM entity title absent from DOM in player mode — link redacted (channel 4)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={leakTestEntity} entitiesById={entitiesById} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(document.body.textContent).not.toContain("Secret Villain");
  });
});

describe("G1 — EntityReadingView render: DM mode shows DM content", () => {
  beforeEach(() => localStorage.clear());

  it("DM body block IS in DOM in DM mode (channel 1)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={leakTestEntity} entitiesById={entitiesById} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(document.body.textContent).toContain("DM_BLOCK_SECRET");
  });

  it("DM entity title IS in DOM in DM mode as a link (channel 4)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityReadingView entity={leakTestEntity} entitiesById={entitiesById} />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(document.body.textContent).toContain("Secret Villain");
  });
});

// ── EntityPanes integration layer (editor primary surface) ───────────────────

describe("G1 — EntityPanes reading mode: player preview makes player pane primary", () => {
  beforeEach(() => localStorage.setItem("atlas.viewMode", "player"));
  afterEach(() => localStorage.clear());

  it("player pane is visible when player mode is on", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entity-pane-player")).toBeVisible();
  });

  it("DM pane is hidden by default in player mode", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entity-pane-dm")).not.toBeVisible();
  });

  it("player pane contains none of the DM secrets (channels 1 & 4)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    const playerPane = screen.getByTestId("entity-pane-player");
    expect(playerPane.textContent).not.toContain("DM_BLOCK_SECRET");
    expect(playerPane.textContent).not.toContain("Secret Villain");
  });

  it("shows a 'player preview' indicator when player mode is on", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("player-preview-banner")).toBeInTheDocument();
  });
});

describe("G1 — EntityPanes reading mode: DM mode keeps DM pane as primary", () => {
  beforeEach(() => localStorage.clear());

  it("DM pane is visible by default in DM mode", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entity-pane-dm")).toBeVisible();
  });

  it("DM pane contains DM body content in DM mode (channel 1)", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={leakTestEntity}
            entitiesById={entitiesById}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entity-pane-dm").textContent).toContain("DM_BLOCK_SECRET");
  });
});
