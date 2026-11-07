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
import { MemoryRouter } from "react-router";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import { EntityPanes } from "@/atlas/entity/EntityPanes";
import {
  projectEntityForPlayer,
  buildProjectionContext,
} from "@/atlas/content/projectEntityForPlayer";
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

// A player-visible entity, the target of the control relationship.
const publicAlly: Entity = {
  ...dmEntity,
  id: "public-ally",
  title: "Public Ally",
  visibility: "player",
};

const entitiesById = new Map([
  [leakTestEntity.id, leakTestEntity],
  [dmEntity.id, dmEntity],
  [publicAlly.id, publicAlly],
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

// ── EntityPanes integration layer (what the editor renders, via EntitySurface) ─

function renderPanes(entity: Entity) {
  return render(
    <MemoryRouter>
      <ViewModeProvider>
        <EntityPanes
          entity={entity}
          entitiesById={entitiesById}
          mode="reading"
          renderEdit={() => null}
        />
      </ViewModeProvider>
    </MemoryRouter>,
  );
}

describe("G1 — EntityPanes reading mode: player preview hides DM content", () => {
  beforeEach(() => localStorage.setItem("atlas.viewMode", "player"));
  afterEach(() => localStorage.clear());

  it("player pane is visible when player mode is on", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-player")).toBeVisible();
  });

  it("DM pane is hidden by default in player mode", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-dm")).not.toBeVisible();
  });

  it("DM body block absent from the player pane in player mode (channel 1)", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-player").textContent).not.toContain("DM_BLOCK_SECRET");
  });

  it("DM entity title absent from the player pane in player mode — link redacted (channel 4)", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-player").textContent).not.toContain("Secret Villain");
  });

  it("shows a 'player preview' indicator when player mode is on", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("player-preview-banner")).toBeInTheDocument();
  });
});

describe("G1 — EntityPanes reading mode: DM mode shows DM content", () => {
  beforeEach(() => localStorage.clear());

  it("DM pane is visible by default in DM mode", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-dm")).toBeVisible();
  });

  it("DM pane contains DM body content in DM mode (channel 1)", () => {
    renderPanes(leakTestEntity);
    expect(screen.getByTestId("entity-pane-dm").textContent).toContain("DM_BLOCK_SECRET");
  });

  it("DM entity title IS in the DM pane in DM mode as a link (channel 4)", () => {
    renderPanes(leakTestEntity);
    const link = screen
      .getByTestId("entity-pane-dm")
      .querySelector('a.atlas-wikilink[data-entity-id="secret-villain"]');
    expect(link?.textContent).toContain("Secret Villain");
  });
});

// ── I1 — Connections-section leak regression ─────────────────────────────────
//
// Channels under test (Connections-specific):
//   5. visibility:dm relationship  — "DM_RELATION_SECRET" (label) must be absent from player Connections
//   6. player-visible relationship pointing at a DM-only target — "Secret Villain" title must be absent
//      from player Connections (filterRelationshipsForPlayer drops it via the "leaking target" rule)
//
// Only the player pane renders Connections in EntityPanes (the DM pane is body-only), so the
// non-vacuity control is a player-safe relationship that must still show there.

// Extend leakTestEntity with an additional player-visible relationship pointing at the DM-only target.
const connectionLeakEntity: Entity = {
  ...leakTestEntity,
  relationships: [
    // Channel 5: dm-visibility relationship
    { entity: "secret-villain", type: "ally", label: "DM_RELATION_SECRET", visibility: "dm" },
    // Channel 6: player-visible but target is DM-only — must also be stripped
    {
      entity: "secret-villain",
      type: "knows_about",
      label: "PLAYER_LINK_TO_DM_TARGET",
      visibility: "player",
    },
    // Control: player-visible relationship to a player-visible target — must render
    { entity: "public-ally", type: "ally", label: "PLAYER_SAFE_LINK", visibility: "player" },
  ] as EntityRelationship[],
};
describe("I1 — Connections section: player mode hides DM relationship channels", () => {
  beforeEach(() => localStorage.setItem("atlas.viewMode", "player"));
  afterEach(() => localStorage.clear());

  it("dm-visibility relationship label absent from the DOM in player mode (channel 5)", () => {
    renderPanes(connectionLeakEntity);
    expect(document.body.textContent).not.toContain("DM_RELATION_SECRET");
  });

  it("player-visible relationship targeting a DM-only entity absent from the DOM in player mode (channel 6)", () => {
    renderPanes(connectionLeakEntity);
    // filterRelationshipsForPlayer drops this because secret-villain is dm-only
    expect(document.body.textContent).not.toContain("PLAYER_LINK_TO_DM_TARGET");
  });

  it("control: a player-safe relationship does render in player Connections", () => {
    renderPanes(connectionLeakEntity);
    const connections = screen.getByTestId("connections-section");
    expect(connections.textContent).toContain("PLAYER_SAFE_LINK");
    expect(connections.textContent).toContain("Public Ally");
  });
});

// ── K1 — Re-import merge leak-regression ─────────────────────────────────────
//
// Proves the merge + player pipeline cannot silently expose DM content:
//   A. DM-only entity re-synced from a vault copy with no visibility stays dm
//   B. Real %%...%% and :::dm::: blocks in merged prose are stripped by the player pipeline

import { mergeImportFrontmatter } from "@/atlas/import/mergeImportFrontmatter";
import { readNote } from "@/atlas/content/readNote";
import { stripDmBlocks } from "@/atlas/content/dmMarkup";

describe("K1 — re-import merge: never auto-exposes, strips real DM blocks", () => {
  it("DM-only entity re-synced from a visibility-less vault copy stays dm (channel A)", () => {
    const disk = readNote(
      "---\natlas:\n  id: villain\n  visibility: dm\n---\nsecret plans\n",
      "content/w/npcs/villain.md",
    );
    const vault = { data: { atlas: {} }, content: "updated public lore %%dm only note%%" };
    const r = mergeImportFrontmatter({ disk, vault, inferredType: "npc", baseType: "npc" });
    expect((r.data.atlas as Record<string, unknown>).visibility).toBe("dm");
    expect(r.exposureIncrease).toBe(false);
  });

  it("a real (non-sentinel) %%...%% and :::dm::: block in merged prose is stripped on the player path (channel B)", () => {
    const body = "Public.\n%%hidden plot twist%%\n:::dm\nGM only\n:::\nMore public.";
    const out = stripDmBlocks(body);
    expect(out.text).not.toContain("hidden plot twist");
    expect(out.text).not.toContain("GM only");
    expect(out.text).toContain("Public.");
    expect(out.text).toContain("More public.");
  });
});
