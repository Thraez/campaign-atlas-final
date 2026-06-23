/**
 * Tests for src/atlas/tabs/EntitiesTab.tsx — N65 hygiene nibble
 *
 * Covers the key render branches of the Entities authoring panel:
 *   - Empty entity list: no entity form shown
 *   - Entity form rendered when entity auto-selected (first entity)
 *   - Discard all changes button: absent/present with count + calls onDraftsChange({})
 *   - Import bar: hidden when no handlers; shown per prop
 *   - Relationship section: empty state; DM badge; unresolved warning; leak warning
 *   - HandoutBundleSection summary row always rendered
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntitiesTab } from "@/atlas/tabs/EntitiesTab";
import type { AtlasProject, Entity } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";
import type { FrontmatterDraft } from "@/atlas/save/canonicalEntitySave";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "entity-1",
    title: "Corven",
    type: "npc",
    visibility: "player",
    aliases: [],
    tags: [],
    images: [],
    body: "",
    bodyHtml: "",
    frontmatter: {},
    sourcePath: "content/npcs/corven.md",
    links: [],
    backlinks: [],
    ...overrides,
  } as Entity;
}

function makeProject(entities: Entity[]): AtlasProject {
  return {
    version: "1",
    publishedAt: null as unknown as string,
    worlds: [],
    maps: [],
    entities,
    placements: [],
    assets: [],
  } as unknown as AtlasProject;
}

interface RenderOpts {
  entities?: Entity[];
  drafts?: Record<string, FrontmatterDraft>;
  onDraftsChange?: (n: Record<string, FrontmatterDraft>) => void;
  onImportMdFiles?: (f: File[]) => void;
  onPasteMarkdown?: () => void;
}

function renderTab(opts: RenderOpts = {}) {
  const entities = opts.entities ?? [];
  const drafts = opts.drafts ?? {};
  const onDraftsChange = opts.onDraftsChange ?? vi.fn();
  return render(
    <EntitiesTab
      project={makeProject(entities)}
      drafts={drafts}
      onDraftsChange={onDraftsChange}
      onImportMdFiles={opts.onImportMdFiles}
      onPasteMarkdown={opts.onPasteMarkdown}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EntitiesTab — Empty entity list", () => {
  it("does not render entity form when entities list is empty", () => {
    renderTab({ entities: [] });
    // sourcePath is rendered only inside the entity form
    expect(screen.queryByText(/content\/npcs/)).toBeNull();
  });
});

describe("EntitiesTab — Entity form", () => {
  it("renders entity sourcePath when first entity is auto-selected", () => {
    renderTab({
      entities: [makeEntity({ sourcePath: "content/npcs/corven.md" })],
    });
    expect(screen.getByText("content/npcs/corven.md")).toBeTruthy();
  });

  it("renders second entity's sourcePath when it is the only entity", () => {
    renderTab({
      entities: [makeEntity({ id: "e-1", sourcePath: "content/factions/guild.md" })],
    });
    expect(screen.getByText("content/factions/guild.md")).toBeTruthy();
  });
});

describe("EntitiesTab — Discard button", () => {
  it("Discard button absent when drafts is empty", () => {
    renderTab({ entities: [makeEntity()], drafts: {} });
    expect(screen.queryByText(/Discard all local changes/)).toBeNull();
  });

  it("Discard button shows dirty count when drafts exist", () => {
    renderTab({
      entities: [makeEntity()],
      drafts: { "entity-1": { summary: "updated" } },
    });
    expect(screen.getByText(/Discard all local changes \(1\)/)).toBeTruthy();
  });

  it("Discard button click calls onDraftsChange({}) clearing all drafts", () => {
    const onDraftsChange = vi.fn();
    const entity = makeEntity();
    render(
      <EntitiesTab
        project={makeProject([entity])}
        drafts={{ "entity-1": { summary: "changed" } }}
        onDraftsChange={onDraftsChange}
      />
    );
    fireEvent.click(screen.getByText(/Discard all local changes/));
    expect(onDraftsChange).toHaveBeenCalledWith({});
  });
});

describe("EntitiesTab — Import bar", () => {
  it("import bar absent when neither handler provided", () => {
    renderTab({ entities: [makeEntity()] });
    expect(screen.queryByText(/Import \.md files/)).toBeNull();
    expect(screen.queryByText(/Paste markdown/)).toBeNull();
  });

  it("'Import .md files…' button shown when onImportMdFiles provided", () => {
    renderTab({ entities: [makeEntity()], onImportMdFiles: vi.fn() });
    expect(screen.getByText(/Import \.md files/)).toBeTruthy();
  });

  it("'Paste markdown' button shown when onPasteMarkdown provided", () => {
    renderTab({ entities: [makeEntity()], onPasteMarkdown: vi.fn() });
    expect(screen.getByText(/Paste markdown/)).toBeTruthy();
  });
});

describe("EntitiesTab — Relationship section", () => {
  it("shows 'No relationships yet.' when relationships is empty", () => {
    renderTab({
      entities: [makeEntity({ relationships: [] })],
    });
    expect(screen.getByText("No relationships yet.")).toBeTruthy();
  });

  it("shows DM badge for relationship with non-player visibility", () => {
    const rels: EntityRelationship[] = [
      { entity: "target-dm", type: "allied_with", visibility: "dm" },
    ];
    const owner = makeEntity({ id: "owner", relationships: rels });
    const target = makeEntity({ id: "target-dm", title: "Shadow Agent", visibility: "dm" });
    renderTab({ entities: [owner, target] });
    expect(screen.getByText("DM")).toBeTruthy();
  });

  it("shows unresolved warning when relationship points at unknown entity id", () => {
    const rels: EntityRelationship[] = [
      { entity: "missing-entity", type: "allied_with", visibility: "player" },
    ];
    const owner = makeEntity({ id: "owner", relationships: rels });
    renderTab({ entities: [owner] });
    expect(screen.getByText(/Unresolved entity id/)).toBeTruthy();
  });

  it("shows leak warning when player-visible relationship targets a DM-only entity", () => {
    const rels: EntityRelationship[] = [
      { entity: "dm-secret", type: "allied_with", visibility: "player" },
    ];
    const owner = makeEntity({ id: "owner", relationships: rels });
    const dmTarget = makeEntity({ id: "dm-secret", title: "Secret NPC", visibility: "dm" });
    renderTab({ entities: [owner, dmTarget] });
    expect(screen.getByText(/Player-visible relationship points at a DM-only entity/)).toBeTruthy();
  });
});

describe("EntitiesTab — Handout bundle section", () => {
  it("renders 'Print handout bundle' summary row regardless of entity count", () => {
    renderTab({ entities: [] });
    expect(screen.getByText(/Print handout bundle/)).toBeTruthy();
  });

  it("renders handout bundle section with entities present", () => {
    renderTab({ entities: [makeEntity()] });
    expect(screen.getByText(/Print handout bundle/)).toBeTruthy();
  });
});
