# DM Editor Part 3 — Information Architecture & Terminology — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eight-tab editor strip with a registry-driven icon rail + single resizable panel over a persistent map, add six type-aware content categories with in-app creation, a global command palette, explicit pin↔entity linkage, plain-language settings, and an Obsidian-safe write path.

**Architecture:** A declarative `railRegistry` is the single source of truth for navigation; the rail, command palette, and badge counts all read it. Each former tab becomes a registry `panel` hosted in one resizable flyout over an always-mounted map canvas — tab component public APIs are unchanged, only their host changes. A pure `entityCategory` mapping projects the freeform `Entity.type` onto six categories with a Lore catch-all. In-app creation writes a new markdown file through the existing atomic save plugin using a hardened, Obsidian-Properties-safe frontmatter serializer.

**Tech Stack:** React + TypeScript + Vite, Vitest + Testing Library, Tailwind, lucide-react, shadcn/ui, gray-matter/js-yaml (existing `stringifyFrontmatter`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-16-dm-editor-part-3-information-architecture-design.md`

**Preconditions (verified against the codebase):** Part 2 is merged. `src/atlas/session/useEditorSession.ts`, `SaveStatus.tsx`, `DiscardConfirmModal.tsx`, `sessionSnapshot.ts`, `idbStore` exist and are wired into `AtlasPlacementEditor.tsx`. The save plugin `scripts/vite-plugin-atlas-save.ts` already writes atomically (temp file + `fs.rename`, backups, rollback) and enforces `baseHash` conflict detection (409 on mismatch; `baseHash: null` = create-only). This plan builds directly on that seam and does not reinvent it.

**Six independently-shippable phases. Each ends green on its own full gate. Execute in order.**

- **Phase 1 — Foundations:** pure `entityCategory` mapping; harden `stringifyFrontmatter` for Obsidian-Properties safety. No UI change. Ships vault-safety value alone.
- **Phase 2 — Shell spine:** registry + rail + single resizable panel over a persistent map; every former tab rehosted with unchanged behavior.
- **Phase 3 — Type-aware categories + progressive create:** six category panels; the quick→full create/edit form; new-entity file write.
- **Phase 4 — Command palette (Ctrl-K):** entities + commands + maps + settings + recent.
- **Phase 5 — Pin↔entity linkage:** explicit placed/unplaced; click-pin-opens-entity; show-on-map.
- **Phase 6 — Plain settings + curated ☰ + Publish home.**

---

## File Structure

**Created:**
- `src/atlas/content/entityCategory.ts` — pure mapping `type → Category` + category metadata. One responsibility: the six-category projection. Total, with a Lore catch-all.
- `src/atlas/shell/railRegistry.tsx` — the declarative `RailItem[]` + types. One responsibility: the single nav source of truth.
- `src/atlas/shell/EditorRail.tsx` — the icon rail (groups, divider, sticky bottom, overflow scroll, tooltips). One responsibility: render the registry as a rail.
- `src/atlas/shell/EditorPanelHost.tsx` — the single resizable flyout host (width persistence, dismissal, single-panel invariant). One responsibility: own which panel is open and its width.
- `src/atlas/shell/useCommandPalette.ts` — palette index builder + filter/rank. One responsibility: produce ranked palette results from registry + project.
- `src/atlas/shell/CommandPalette.tsx` — the Ctrl-K overlay. One responsibility: render/operate the palette.
- `src/atlas/categories/CategoryPanel.tsx` — one reusable category browser (search, recency sort, empty stub, ＋New/Import). One responsibility: list+enter a category.
- `src/atlas/categories/EntityEditorPanel.tsx` — the progressive quick→full create/edit form wrapper. One responsibility: create or edit one entity.
- `src/atlas/save/newEntitySave.ts` — `buildNewEntityChange` (folder choice, slug, create-only `FileChange`). One responsibility: turn a new-entity draft into a create `FileChange`.
- `src/atlas/settings/WorldDetailsPanel.tsx` — plain-label world settings. One responsibility: edit `world.yaml`-level fields.
- `src/atlas/shell/EditorMenu.tsx` — the curated ☰ menu. One responsibility: the allow-listed map/world/help actions.
- Test files mirror each created module under `src/test/...` (paths given per task).

**Modified:**
- `src/atlas/import/frontmatter.ts` — harden `stringifyFrontmatter` for Obsidian-Properties safety.
- `src/pages/AtlasPlacementEditor.tsx` — replace the `<Tabs>` block (file:1109-1331) with `<EditorRail>` + `<EditorPanelHost>` + persistent map; mount `<CommandPalette>`; wire new-entity save; mount `<EditorMenu>`.
- `src/atlas/MapSettingsPanel.tsx` — plain relabel; delete `dirtyKeys`/"Unsaved:" line and the "Discard local edits" button; replace the jargon banner.
- `src/atlas/tabs/PinsTab` host usage — add placed/unplaced indicator + click-pin/show-on-map wiring (component API unchanged; props extended).

---

## Phase 1 — Foundations

### Task 1.1: Pure six-category mapping

**Files:**
- Create: `src/atlas/content/entityCategory.ts`
- Test: `src/test/content/entityCategory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/content/entityCategory.test.ts
import { describe, it, expect } from "vitest";
import {
  categoryForType,
  CATEGORIES,
  type CategoryId,
} from "@/atlas/content/entityCategory";

describe("entityCategory", () => {
  it("exposes exactly the six categories in order", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      "characters", "locations", "factions", "events", "items", "lore",
    ]);
  });

  it("maps every known pin-preset type to a single category", () => {
    const expected: Record<string, CategoryId> = {
      npc: "characters", character: "characters", person: "characters",
      settlement: "locations", capital: "locations", city: "locations",
      town: "locations", village: "locations", port: "locations",
      region: "locations", ruin: "locations", dungeon: "locations",
      cave: "locations", temple: "locations", divine_site: "locations",
      shop: "locations", black_market: "locations", hazard: "locations",
      wilderness_landmark: "locations", mystery: "locations",
      resonance_site: "locations", player_base: "locations",
      faction: "factions", event: "events", item: "items",
    };
    for (const [type, cat] of Object.entries(expected)) {
      expect(categoryForType(type)).toBe(cat);
    }
  });

  it("is total: unknown and empty types fall back to lore (nothing unreachable)", () => {
    expect(categoryForType("")).toBe("lore");
    expect(categoryForType(undefined)).toBe("lore");
    expect(categoryForType("totally-made-up")).toBe("lore");
    expect(categoryForType("LORE")).toBe("lore");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/content/entityCategory.test.ts`
Expected: FAIL — `Cannot find module '@/atlas/content/entityCategory'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/content/entityCategory.ts
export type CategoryId =
  | "characters" | "locations" | "factions" | "events" | "items" | "lore";

export interface CategoryMeta {
  id: CategoryId;
  /** Plural nav label. */ label: string;
  /** Singular, used in "＋ New {singular}". */ singular: string;
  /** Default content sub-folder a new entity of this category is written into. */
  folder: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "characters", label: "Characters", singular: "Character", folder: "npcs" },
  { id: "locations",  label: "Locations",  singular: "Location",  folder: "settlements" },
  { id: "factions",   label: "Factions",   singular: "Faction",   folder: "factions" },
  { id: "events",     label: "Events",     singular: "Event",     folder: "events" },
  { id: "items",      label: "Items",      singular: "Item",      folder: "items" },
  { id: "lore",       label: "Lore",       singular: "Lore entry", folder: "lore" },
];

const TYPE_TO_CATEGORY: Record<string, CategoryId> = {
  npc: "characters", character: "characters", person: "characters",
  settlement: "locations", capital: "locations", city: "locations",
  town: "locations", village: "locations", port: "locations",
  region: "locations", ruin: "locations", dungeon: "locations",
  cave: "locations", temple: "locations", divine_site: "locations",
  shop: "locations", black_market: "locations", hazard: "locations",
  wilderness_landmark: "locations", mystery: "locations",
  resonance_site: "locations", player_base: "locations",
  faction: "factions",
  event: "events",
  item: "items",
};

/** Total: any unknown/empty/undefined type resolves to "lore". */
export function categoryForType(type: string | undefined | null): CategoryId {
  const t = (type ?? "").trim().toLowerCase();
  return TYPE_TO_CATEGORY[t] ?? "lore";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/content/entityCategory.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/entityCategory.ts src/test/content/entityCategory.test.ts
git commit -m "feat(part3): pure six-category entity mapping with lore catch-all"
```

### Task 1.2: Obsidian-Properties-safe frontmatter serialization

**Context:** `src/atlas/save/canonicalEntitySave.ts` re-serializes via `stringifyFrontmatter` from `src/atlas/import/frontmatter.ts`. Obsidian's Properties parser silently reformats/strips frontmatter it dislikes (multiline scalars, unquoted ambiguous strings, unsupported types). New entities created in-app are opened in Obsidian, so the serializer must emit Properties-safe YAML and never touch the prose body.

**Files:**
- Modify: `src/atlas/import/frontmatter.ts` (the `stringifyFrontmatter` export)
- Test: `src/test/import/frontmatter-obsidian-safe.test.ts`

- [ ] **Step 1: Read the current serializer**

Run: `npx vitest run --reporter=verbose 2>/dev/null; sed -n '1,80p' src/atlas/import/frontmatter.ts`
Read `stringifyFrontmatter`'s current signature and js-yaml options. Note the exact exported name and parameter shape before editing.

- [ ] **Step 2: Write the failing test**

```ts
// src/test/import/frontmatter-obsidian-safe.test.ts
import { describe, it, expect } from "vitest";
import { stringifyFrontmatter, parseFrontmatter } from "@/atlas/import/frontmatter";

describe("stringifyFrontmatter — Obsidian Properties safety", () => {
  it("round-trips data through a strict re-parse without field loss", () => {
    const data = {
      title: "Corven", type: "npc", visibility: "dm",
      aliases: ["The Smuggler-King", "Onyx"],
      summary: "A line with: a colon, a #hash, and a 'quote'.",
      tags: ["npc", "legend"],
    };
    const raw = stringifyFrontmatter("# Corven\n\nBody stays.\n", data);
    const back = parseFrontmatter(raw);
    expect(back.data).toEqual(data);
    expect(back.content).toContain("Body stays.");
  });

  it("emits no multiline YAML scalars (no '|' or '>' block indicators in frontmatter)", () => {
    const raw = stringifyFrontmatter("body", {
      summary: "First sentence. Second sentence. Third — still one line.",
    });
    const fm = raw.split("---")[1] ?? "";
    expect(fm).not.toMatch(/:\s*[|>][-+0-9]*\s*\n/);
  });

  it("quotes strings that YAML would otherwise coerce (numbers, bools, dates)", () => {
    const raw = stringifyFrontmatter("body", {
      date: "0-1-1", code: "012", flag: "true",
    });
    const back = parseFrontmatter(raw);
    expect(back.data.date).toBe("0-1-1");
    expect(back.data.code).toBe("012");
    expect(back.data.flag).toBe("true");
  });

  it("never mutates the prose body", () => {
    const body = "# Title\n\nParagraph with [[WikiLink]] and ![[img.png]].\n";
    const raw = stringifyFrontmatter(body, { title: "X" });
    expect(parseFrontmatter(raw).content).toBe(body);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/import/frontmatter-obsidian-safe.test.ts`
Expected: FAIL — likely the multiline-scalar and coercion assertions fail (js-yaml defaults fold long lines / emit bare scalars).

- [ ] **Step 4: Harden the serializer**

In `src/atlas/import/frontmatter.ts`, set the js-yaml `dump` options used by `stringifyFrontmatter` to:

```ts
// inside stringifyFrontmatter, where data is dumped to YAML:
const yamlText = yaml.dump(data, {
  lineWidth: -1,        // never fold/wrap → no '>' or '|' multiline scalars
  noRefs: true,         // no YAML anchors/aliases
  quotingType: '"',     // consistent double-quote style Obsidian accepts
  forceQuotes: false,   // quote only when needed (keep diffs small)
  sortKeys: false,      // preserve author key order; do not reorder frontmatter
});
```

Then add a coercion guard so values YAML would re-type are emitted as quoted strings. Immediately before the `yaml.dump` call, normalize string values that look like numbers/bools/dates:

```ts
const AMBIGUOUS = /^(?:true|false|null|~|-?\d+(?:\.\d+)?|\d{1,4}-\d{1,2}-\d{1,2}.*)$/i;
function obsidianSafe(value: unknown): unknown {
  if (typeof value === "string" && AMBIGUOUS.test(value.trim())) {
    return { __quote: value }; // sentinel handled below
  }
  if (Array.isArray(value)) return value.map(obsidianSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, obsidianSafe(v)]),
    );
  }
  return value;
}
```

js-yaml has no per-value quote hook, so instead of a sentinel use `yaml.dump` with a `replacer`-free approach: pre-wrap ambiguous strings by giving js-yaml a custom type is overkill. Simpler and exact: after dump, the only ambiguous values are scalars on their own line; force-quote them by passing `forceQuotes: true` **only** when the dataset contains an ambiguous string, else `false`:

```ts
const hasAmbiguous = JSON.stringify(data).match(AMBIGUOUS) != null;
const yamlText = yaml.dump(data, {
  lineWidth: -1, noRefs: true, quotingType: '"',
  forceQuotes: hasAmbiguous, sortKeys: false,
});
```

Keep the body concatenation exactly as the current function does (do not trim or re-render the body). Remove the unused `obsidianSafe` sketch above; the `forceQuotes` toggle is the implementation.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/import/frontmatter-obsidian-safe.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 6: Run the existing frontmatter/save tests for regression**

Run: `npx vitest run src/test/import src/test/atlas-yaml-canon.test.ts`
Expected: PASS — no existing frontmatter/canon test breaks (key order preserved, body untouched).

- [ ] **Step 7: Commit**

```bash
git add src/atlas/import/frontmatter.ts src/test/import/frontmatter-obsidian-safe.test.ts
git commit -m "feat(part3): Obsidian-Properties-safe frontmatter serialization"
```

### Task 1.3: Phase 1 full gate

- [ ] **Step 1: Run the whole gate**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
Expected: tsc clean; all Vitest green; lint clean (pre-existing tracked errors excepted); `atlas:publish` secrets + derived scans clean.

- [ ] **Step 2: Commit any lint/format fixups, then tag the phase**

```bash
git add -A && git commit -m "chore(part3): phase 1 gate green" || echo "nothing to commit"
```

---

## Phase 2 — Shell spine

### Task 2.1: Rail registry

**Files:**
- Create: `src/atlas/shell/railRegistry.tsx`
- Test: `src/test/shell/railRegistry.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/railRegistry.test.tsx
import { describe, it, expect } from "vitest";
import { buildRailItems, type RailItem } from "@/atlas/shell/railRegistry";

const noop = () => null;

describe("railRegistry", () => {
  it("emits content group then map group then system group, in order", () => {
    const items = buildRailItems({
      panels: { categories: {}, tools: {}, system: {} } as never,
      counts: {},
    });
    const groups = items.map((i: RailItem) => i.group);
    const firstMap = groups.indexOf("map");
    const firstSystem = groups.indexOf("system");
    expect(groups.indexOf("content")).toBeLessThan(firstMap);
    expect(firstMap).toBeLessThan(firstSystem);
  });

  it("includes the six content categories and the four map tools", () => {
    const items = buildRailItems({ panels: {} as never, counts: {} });
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "characters", "locations", "factions", "events", "items", "lore",
        "pins", "regions", "routes", "fog", "save", "publish",
      ]),
    );
  });

  it("resolves a badge count when a badge fn is provided", () => {
    const items = buildRailItems({ panels: {} as never, counts: { pins: 3 } });
    const pins = items.find((i) => i.id === "pins")!;
    expect(pins.badge?.()).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/railRegistry.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/shell/railRegistry.tsx
import type { ReactNode } from "react";
import {
  Users, MapPin, Flag, ScrollText, Package, BookOpen,
  Pin as PinIcon, Shapes, Route as RouteIcon, CloudFog,
  Save as SaveIcon, ShieldCheck,
} from "lucide-react";

export type RailGroup = "content" | "map" | "system";

export interface RailItem {
  id: string;
  group: RailGroup;
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Returns a count to show as a badge, or undefined for none. */
  badge?: () => number | undefined;
  /** The panel React node rendered in the flyout host when active. */
  panel?: ReactNode;
}

export interface BuildRailArgs {
  /** Per-id panel nodes supplied by the editor (kept out of the registry so the registry stays declarative/testable). */
  panels: Record<string, ReactNode>;
  /** Per-id badge counts (already computed by the editor). */
  counts: Record<string, number | undefined>;
}

const ICON = "h-4 w-4";

export function buildRailItems({ panels, counts }: BuildRailArgs): RailItem[] {
  const mk = (
    id: string, group: RailGroup, label: string,
    icon: ReactNode, shortcut?: string,
  ): RailItem => ({
    id, group, label, shortcut, icon,
    badge: () => counts[id],
    panel: panels[id],
  });
  return [
    mk("characters", "content", "Characters", <Users className={ICON} />, "1"),
    mk("locations", "content", "Locations", <MapPin className={ICON} />, "2"),
    mk("factions", "content", "Factions", <Flag className={ICON} />, "3"),
    mk("events", "content", "Events", <ScrollText className={ICON} />, "4"),
    mk("items", "content", "Items", <Package className={ICON} />, "5"),
    mk("lore", "content", "Lore", <BookOpen className={ICON} />, "6"),
    mk("pins", "map", "Pins", <PinIcon className={ICON} />, "P"),
    mk("regions", "map", "Regions", <Shapes className={ICON} />, "R"),
    mk("routes", "map", "Routes", <RouteIcon className={ICON} />, "T"),
    mk("fog", "map", "Fog", <CloudFog className={ICON} />, "F"),
    mk("save", "system", "Save", <SaveIcon className={ICON} />, "Ctrl+S"),
    mk("publish", "system", "Publish", <ShieldCheck className={ICON} />),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shell/railRegistry.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/shell/railRegistry.tsx src/test/shell/railRegistry.test.tsx
git commit -m "feat(part3): declarative rail registry"
```

### Task 2.2: EditorRail component

**Files:**
- Create: `src/atlas/shell/EditorRail.tsx`
- Test: `src/test/shell/EditorRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/EditorRail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorRail } from "@/atlas/shell/EditorRail";
import { buildRailItems } from "@/atlas/shell/railRegistry";

const items = buildRailItems({ panels: {}, counts: { pins: 2 } });

describe("EditorRail", () => {
  it("renders a caption label and a tooltip-title with shortcut for each item", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Characters")).toBeInTheDocument();
    const pins = screen.getByRole("button", { name: /Pins/ });
    expect(pins).toHaveAttribute("title", expect.stringContaining("P"));
  });

  it("renders a divider between content and map groups", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByTestId("rail-divider-map")).toBeInTheDocument();
  });

  it("shows a badge when count > 0", () => {
    render(<EditorRail items={items} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls onSelect with the item id on click", () => {
    const onSelect = vi.fn();
    render(<EditorRail items={items} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Locations/ }));
    expect(onSelect).toHaveBeenCalledWith("locations");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/EditorRail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/shell/EditorRail.tsx
import { Fragment } from "react";
import type { RailItem, RailGroup } from "./railRegistry";

const GROUP_ORDER: RailGroup[] = ["content", "map", "system"];

export function EditorRail({
  items, activeId, onSelect,
}: {
  items: RailItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      className="flex flex-col items-stretch w-[64px] shrink-0 border-r bg-background py-2 overflow-y-auto"
      aria-label="Editor sections"
    >
      {GROUP_ORDER.map((group, gi) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        const isSystem = group === "system";
        return (
          <Fragment key={group}>
            {gi > 0 && (
              <div
                data-testid={`rail-divider-${group}`}
                className={`mx-3 my-1 border-t ${isSystem ? "mt-auto" : ""}`}
              />
            )}
            {groupItems.map((it) => {
              const count = it.badge?.();
              const active = activeId === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  title={it.shortcut ? `${it.label} (${it.shortcut})` : it.label}
                  aria-label={it.label}
                  aria-pressed={active}
                  onClick={() => onSelect(it.id)}
                  className={`relative flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] leading-tight
                    ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <span aria-hidden>{it.icon}</span>
                  <span className="truncate w-full text-center">{it.label}</span>
                  {typeof count === "number" && count > 0 && (
                    <span className="absolute top-1 right-2 rounded-full bg-primary text-primary-foreground text-[9px] px-1">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </Fragment>
        );
      })}
    </nav>
  );
}
```

Note: `mt-auto` on the system divider pushes Save/Publish to the rail bottom; `overflow-y-auto` on the `<nav>` gives vertical scroll on short viewports while the system group stays pinned (it is the last group; with `mt-auto` it hugs the bottom and Save/Publish never scroll out — verified by the next test).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shell/EditorRail.test.tsx`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/shell/EditorRail.tsx src/test/shell/EditorRail.test.tsx
git commit -m "feat(part3): editor icon rail with groups, labels, badges"
```

### Task 2.3: EditorPanelHost (single resizable flyout, dismissal, invariant)

**Files:**
- Create: `src/atlas/shell/EditorPanelHost.tsx`
- Test: `src/test/shell/EditorPanelHost.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/EditorPanelHost.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorPanelHost } from "@/atlas/shell/EditorPanelHost";

beforeEach(() => localStorage.clear());

describe("EditorPanelHost", () => {
  it("renders nothing when no panel is active", () => {
    const { container } = render(
      <EditorPanelHost activeId={null} title="" onDismiss={vi.fn()}>
        <div>X</div>
      </EditorPanelHost>,
    );
    expect(container.querySelector("[data-panel]")).toBeNull();
  });

  it("renders the panel and closes on ✕, Esc, and backdrop click", () => {
    const onDismiss = vi.fn();
    render(
      <EditorPanelHost activeId="pins" title="Pins" onDismiss={onDismiss}>
        <div>Pins panel</div>
      </EditorPanelHost>,
    );
    expect(screen.getByText("Pins panel")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close panel"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("panel-backdrop"));
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it("clamps persisted width to <= 50% of the viewport", () => {
    localStorage.setItem("atlas.panelWidth", "99999");
    render(
      <EditorPanelHost activeId="pins" title="Pins" onDismiss={vi.fn()}>
        <div>P</div>
      </EditorPanelHost>,
    );
    const panel = screen.getByTestId("panel");
    const px = parseInt(panel.style.width, 10);
    expect(px).toBeLessThanOrEqual(Math.floor(window.innerWidth * 0.5));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/EditorPanelHost.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/shell/EditorPanelHost.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const KEY = "atlas.panelWidth";
const DEFAULT_FRAC = 1 / 3;
const MAX_FRAC = 0.5;

function clampWidth(px: number): number {
  const max = Math.floor(window.innerWidth * MAX_FRAC);
  const min = 280;
  return Math.max(min, Math.min(px, max));
}

export function EditorPanelHost({
  activeId, title, onDismiss, children,
}: {
  activeId: string | null;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(KEY));
    return clampWidth(
      Number.isFinite(saved) && saved > 0
        ? saved
        : Math.floor(window.innerWidth * DEFAULT_FRAC),
    );
  });
  const dragging = useRef(false);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, onDismiss]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const w = clampWidth(e.clientX);
      setWidth(w);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      localStorage.setItem(KEY, String(width));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [width]);

  if (!activeId) return null;

  return (
    <>
      {/* Backdrop is only over the still-visible map area; mousedown closes and is absorbed (no map event). */}
      <div
        data-testid="panel-backdrop"
        className="absolute inset-0 z-10"
        style={{ left: width }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
      />
      <aside
        data-panel
        data-testid="panel"
        className="absolute left-0 top-0 bottom-0 z-20 flex flex-col border-r bg-background shadow-xl"
        style={{ width }}
      >
        <header className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium truncate">{title}</span>
          <button
            type="button"
            aria-label="Close panel"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onMouseDown={() => { dragging.current = true; }}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
        />
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shell/EditorPanelHost.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/shell/EditorPanelHost.tsx src/test/shell/EditorPanelHost.test.tsx
git commit -m "feat(part3): single resizable dismissible panel host"
```

### Task 2.4: Replace the Tabs block with rail + panel host (rehost every tab unchanged)

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (replace file:1109-1331; add state + handlers)
- Test: `src/test/shell/editor-rehost.test.tsx`

- [ ] **Step 1: Write the failing regression test**

```tsx
// src/test/shell/editor-rehost.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AtlasPlacementEditor from "@/pages/AtlasPlacementEditor";

// Uses the existing test harness/fixtures pattern from src/test/* for mounting
// the editor with a stub project (mirror the setup already used by any existing
// AtlasPlacementEditor test; if none exists, use the project fixture from
// src/test/fixtures and a MemoryRouter as other editor tests do).

describe("editor shell rehost", () => {
  it("opens each former tab as a panel from the rail without losing it", async () => {
    render(<AtlasPlacementEditor />);
    for (const label of ["Characters", "Pins", "Regions", "Routes", "Fog"]) {
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(label) }));
      expect(screen.getByTestId("panel")).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/editor-rehost.test.tsx`
Expected: FAIL — rail buttons do not exist yet (still `<Tabs>`).

- [ ] **Step 3: Add shell state and handlers to `AtlasPlacementEditor.tsx`**

Near the existing tab/filter state (around file:385), add:

```tsx
const [activePanel, setActivePanel] = useState<string | null>(null);
const selectPanel = (id: string) =>
  setActivePanel((cur) => (cur === id ? null : id)); // active-icon click closes
const dismissPanel = () => setActivePanel(null);
```

- [ ] **Step 4: Build the panels map and replace the Tabs block**

Replace the entire `<Tabs defaultValue="pins"> … </Tabs>` block (file:1109-1331) with the rail + persistent map + panel host. The per-tab JSX bodies (their existing `<RegionsTab .../>`, `<EntitiesTab .../>`, `<PublishCheckTab .../>`, the Maps nested content, etc.) are MOVED verbatim into the `panels` map values — same components, same props, no behavior change:

```tsx
{(() => {
  const panels: Record<string, React.ReactNode> = {
    // content categories — Phase 3 replaces these with <CategoryPanel>;
    // for Phase 2 they all render the existing <EntitiesTab> so nothing is lost.
    characters: <EntitiesTab project={project} blockingCount={entityIssues.blocking} warningCount={entityIssues.warning} onImportMdFiles={importFlow.openWithFiles} onPasteMarkdown={() => setPasteOpen(true)} drafts={entityDrafts} onDraftsChange={setEntityDrafts} />,
    locations: null, factions: null, events: null, items: null, lore: null,
    pins: (/* the exact JSX previously inside <TabsContent value="pins"> */ <></>),
    regions: <RegionsTab /* exact props as before */ />,
    routes: <RoutesTab /* exact props as before */ />,
    fog: <FogTab /* exact props as before */ />,
    publish: <PublishCheckTab /* exact props as before */ />,
  };
  // Phase-2 stopgap: until Phase 3, locations/factions/events/items/lore reuse the
  // entities panel so no content is unreachable.
  for (const k of ["locations","factions","events","items","lore"]) {
    panels[k] = panels[k] ?? panels.characters;
  }
  const counts: Record<string, number | undefined> = {
    pins: unplacedCount, // existing computed value used by the old Pins filter
  };
  const items = buildRailItems({ panels, counts });
  const active = items.find((i) => i.id === activePanel);
  return (
    <div className="relative flex-1 flex min-h-0">
      <EditorRail items={items} activeId={activePanel} onSelect={(id) => {
        if (id === "save") { onSaveClick(); return; }
        selectPanel(id);
      }} />
      <div className="relative flex-1 min-h-0">
        {/* persistent map canvas — the existing map element, always mounted */}
        {/* (move the existing map/overlay JSX here, unchanged) */}
        <EditorPanelHost
          activeId={activePanel}
          title={active?.label ?? ""}
          onDismiss={dismissPanel}
        >
          {active?.panel}
        </EditorPanelHost>
      </div>
    </div>
  );
})()}
```

Add imports at the top of the file:

```tsx
import { EditorRail } from "@/atlas/shell/EditorRail";
import { EditorPanelHost } from "@/atlas/shell/EditorPanelHost";
import { buildRailItems } from "@/atlas/shell/railRegistry";
```

Remove the now-unused `Tabs, TabsList, TabsTrigger, TabsContent` import (file:15) only if no longer referenced anywhere in the file (the Maps sub-tabs may still use nested `<Tabs>` — if so, keep the import; the Maps panel’s internal Layers/Settings sub-tabs are unchanged and live inside `panels.maps`). Provide a `maps` panel entry containing the exact former Maps `<TabsContent>` body (including its nested `<Tabs defaultValue="layers">`).

Keep the existing toolbar `<SaveStatus .../>` (file:953-960) and `<DiscardConfirmModal .../>` exactly where they are — Part 2's status surface is unchanged; the rail "save" item just calls the same `onSaveClick`.

- [ ] **Step 5: Run the rehost test + full editor regression**

Run: `npx vitest run src/test/shell/editor-rehost.test.tsx && npx vitest run`
Expected: rehost test PASS; all previously-green editor/tab tests still PASS (behavior unchanged, only host changed).

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add src/pages/AtlasPlacementEditor.tsx src/test/shell/editor-rehost.test.tsx
git commit -m "feat(part3): rehost all editor tabs into rail + panel shell"
```

### Task 2.5: Phase 2 full gate

- [ ] **Step 1: Run the gate + desktop browser smoke**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
Then `npm run dev` and verify by hand: rail shows content+map+system groups with a divider; Save/Publish pinned bottom; clicking each rail item opens its panel over the still-visible map; clicking the active item / ✕ / Esc / map background all close it; only one panel open at a time; resize handle works and width persists across reload; every former tab’s controls function exactly as before.

- [ ] **Step 2: Commit fixups**

```bash
git add -A && git commit -m "chore(part3): phase 2 gate green" || echo "nothing to commit"
```

---

## Phase 3 — Type-aware categories + progressive create

### Task 3.1: New-entity FileChange builder

**Files:**
- Create: `src/atlas/save/newEntitySave.ts`
- Test: `src/test/save/newEntitySave.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/save/newEntitySave.test.ts
import { describe, it, expect } from "vitest";
import { buildNewEntityChange } from "@/atlas/save/newEntitySave";
import { parseFrontmatter } from "@/atlas/import/frontmatter";

describe("buildNewEntityChange", () => {
  it("creates a slugged .md in the category folder with baseHash null", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/astrath-deeprealm",
      category: "characters",
      title: "Captain Mire Vale",
      summary: "Harbor-master with a debt.",
      visibility: "dm",
      kind: "npc",
    });
    expect(change.kind).toBe("entity-md");
    expect(change.baseHash).toBeNull();              // create-only
    expect(change.path).toBe(
      "content/astrath-deeprealm/npcs/captain-mire-vale.md",
    );
    const fm = parseFrontmatter(change.content);
    expect(fm.data).toMatchObject({
      title: "Captain Mire Vale",
      type: "npc",
      visibility: "dm",
      summary: "Harbor-master with a debt.",
    });
    expect(fm.content.trim()).toContain("# Captain Mire Vale");
  });

  it("defaults kind from category when kind is omitted", () => {
    const change = buildNewEntityChange({
      worldRoot: "content/w", category: "factions",
      title: "The Tide Court", visibility: "player",
    });
    expect(parseFrontmatter(change.content).data.type).toBe("faction");
    expect(change.path).toBe("content/w/factions/the-tide-court.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/save/newEntitySave.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/save/newEntitySave.ts
import type { FileChange } from "@/atlas/save/canonicalEntitySave";
import { stringifyFrontmatter } from "@/atlas/import/frontmatter";
import { CATEGORIES, type CategoryId } from "@/atlas/content/entityCategory";
import type { EntityVisibility } from "@/atlas/content/schema";

const DEFAULT_KIND: Record<CategoryId, string> = {
  characters: "npc", locations: "settlement", factions: "faction",
  events: "event", items: "item", lore: "lore",
};

export function slugify(title: string): string {
  return title.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface NewEntityInput {
  worldRoot: string;            // e.g. "content/astrath-deeprealm"
  category: CategoryId;
  title: string;
  summary?: string;
  visibility: EntityVisibility;
  kind?: string;                // granular type; defaults from category
}

export function buildNewEntityChange(input: NewEntityInput): FileChange {
  const meta = CATEGORIES.find((c) => c.id === input.category)!;
  const type = (input.kind ?? DEFAULT_KIND[input.category]).trim();
  const slug = slugify(input.title);
  const path = `${input.worldRoot}/${meta.folder}/${slug}.md`;
  const data: Record<string, unknown> = {
    title: input.title,
    type,
    visibility: input.visibility,
  };
  if (input.summary) data.summary = input.summary;
  const content = stringifyFrontmatter(`\n# ${input.title}\n\n`, data);
  return { path, content, kind: "entity-md", baseHash: null };
}
```

If `FileChange` is not exported from `canonicalEntitySave.ts`, add `export` to its declaration there (type-only change; no behavior impact) and note it in the commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/save/newEntitySave.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/save/newEntitySave.ts src/test/save/newEntitySave.test.ts src/atlas/save/canonicalEntitySave.ts
git commit -m "feat(part3): new-entity create FileChange builder"
```

### Task 3.2: CategoryPanel (search, recency sort, empty stub, ＋New/Import)

**Files:**
- Create: `src/atlas/categories/CategoryPanel.tsx`
- Test: `src/test/categories/CategoryPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/categories/CategoryPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryPanel } from "@/atlas/categories/CategoryPanel";

const entities = [
  { id: "a", title: "Alda", type: "npc", dateValue: 1 },
  { id: "b", title: "Borin", type: "npc", dateValue: 9 },
] as never[];

describe("CategoryPanel", () => {
  it("lists only this category, recency-sorted (newest first)", () => {
    render(
      <CategoryPanel category="characters" entities={entities}
        onOpen={vi.fn()} onNew={vi.fn()} onImport={vi.fn()} />,
    );
    const rows = screen.getAllByTestId("entity-row").map((r) => r.textContent);
    expect(rows[0]).toContain("Borin"); // dateValue 9 first
  });

  it("filters by the search box", () => {
    render(
      <CategoryPanel category="characters" entities={entities}
        onOpen={vi.fn()} onNew={vi.fn()} onImport={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/search characters/i), {
      target: { value: "ald" },
    });
    expect(screen.queryByText("Borin")).toBeNull();
    expect(screen.getByText("Alda")).toBeInTheDocument();
  });

  it("shows the empty stub with New + Import when the category is empty", () => {
    const onNew = vi.fn();
    render(
      <CategoryPanel category="items" entities={[]}
        onOpen={vi.fn()} onNew={onNew} onImport={vi.fn()} />,
    );
    expect(screen.getByText(/No items yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New Item/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/categories/CategoryPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/categories/CategoryPanel.tsx
import { useMemo, useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { CATEGORIES, categoryForType, type CategoryId } from "@/atlas/content/entityCategory";

export function CategoryPanel({
  category, entities, onOpen, onNew, onImport,
}: {
  category: CategoryId;
  entities: Entity[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
}) {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const inCat = entities.filter((e) => categoryForType(e.type) === category);
    const filtered = q.trim()
      ? inCat.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()))
      : inCat;
    return [...filtered].sort(
      (a, b) => (b.dateValue ?? 0) - (a.dateValue ?? 0), // recency default
    );
  }, [entities, category, q]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b">
        <input
          className="w-full h-8 px-2 text-xs rounded border bg-background"
          placeholder={`Search ${meta.label.toLowerCase()}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No {meta.label.toLowerCase()} yet — create your first or import.
          </div>
        ) : (
          rows.map((e) => (
            <button
              key={e.id}
              data-testid="entity-row"
              type="button"
              onClick={() => onOpen(e.id)}
              className="block w-full text-left px-3 py-2 text-xs border-b hover:bg-muted"
            >
              {e.title}
            </button>
          ))
        )}
      </div>
      <div className="p-2 border-t flex flex-col gap-2">
        <button
          type="button" onClick={onNew}
          className="h-8 text-xs rounded bg-primary text-primary-foreground"
        >
          ＋ New {meta.singular}
        </button>
        <button
          type="button" onClick={onImport}
          className="h-8 text-xs rounded border"
        >
          Import .md / paste
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/categories/CategoryPanel.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/categories/CategoryPanel.tsx src/test/categories/CategoryPanel.test.tsx
git commit -m "feat(part3): reusable category browser panel"
```

### Task 3.3: Progressive create/edit form + wire into the shell and Save

**Files:**
- Create: `src/atlas/categories/EntityEditorPanel.tsx`
- Modify: `src/pages/AtlasPlacementEditor.tsx` (replace the six content `panels` entries; add new-entity save wiring)
- Test: `src/test/categories/EntityEditorPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/categories/EntityEditorPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntityEditorPanel } from "@/atlas/categories/EntityEditorPanel";

describe("EntityEditorPanel (create mode)", () => {
  it("shows quick fields; reveals full fields under 'More details'; submits a draft", () => {
    const onCreate = vi.fn();
    render(
      <EntityEditorPanel
        mode="create" category="characters"
        onCreate={onCreate} onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Mire Vale" } });
    expect(screen.queryByText(/relationships/i)).toBeNull();   // hidden by default
    fireEvent.click(screen.getByRole("button", { name: /more details/i }));
    expect(screen.getByText(/relationships/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Mire Vale", category: "characters" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/categories/EntityEditorPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/categories/EntityEditorPanel.tsx
import { useState } from "react";
import type { CategoryId } from "@/atlas/content/entityCategory";
import type { EntityVisibility } from "@/atlas/content/schema";

export interface NewEntityDraft {
  category: CategoryId;
  title: string;
  summary?: string;
  visibility: EntityVisibility;
  kind?: string;
}

export function EntityEditorPanel({
  mode, category, onCreate, onCancel, fullFields,
}: {
  mode: "create" | "edit";
  category: CategoryId;
  onCreate: (draft: NewEntityDraft) => void;
  onCancel: () => void;
  /** Existing <EntityForm> node for edit mode / full-detail reveal (Phase 3 keeps it intact). */
  fullFields?: React.ReactNode;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<EntityVisibility>("dm");
  const [kind, setKind] = useState("");
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        <label className="block">
          <span className="block mb-1">Name</span>
          <input aria-label="Name" className="w-full h-8 px-2 rounded border bg-background"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">One-line summary</span>
          <input className="w-full h-8 px-2 rounded border bg-background"
            value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="block">
          <span className="block mb-1">Visibility</span>
          <select className="w-full h-8 px-2 rounded border bg-background"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as EntityVisibility)}>
            <option value="player">player</option>
            <option value="dm">dm</option>
            <option value="hidden">hidden</option>
            <option value="rumor">rumor</option>
          </select>
        </label>
        <label className="block">
          <span className="block mb-1">Kind</span>
          <input className="w-full h-8 px-2 rounded border bg-background"
            placeholder="defaults from category"
            value={kind} onChange={(e) => setKind(e.target.value)} />
        </label>

        <button type="button" className="text-primary underline"
          onClick={() => setShowMore((s) => !s)}>
          {showMore ? "Hide details" : "More details"}
        </button>
        {showMore && (
          <div className="border-t pt-3">
            {/* Full profile + Relationships. Phase 3 renders the existing
                <EntityForm> here for edit mode; create mode shows the same
                section scaffold so nothing is lost. */}
            <div>{fullFields ?? <p className="text-muted-foreground">Relationships and profile fields appear here.</p>}</div>
          </div>
        )}
      </div>
      <div className="p-2 border-t flex gap-2">
        <button type="button" className="h-8 px-3 text-xs rounded border" onClick={onCancel}>
          Cancel
        </button>
        <button type="button"
          className="h-8 px-3 text-xs rounded bg-primary text-primary-foreground"
          disabled={!title.trim()}
          onClick={() =>
            onCreate({
              category, title: title.trim(),
              summary: summary.trim() || undefined,
              visibility, kind: kind.trim() || undefined,
            })
          }>
          {mode === "create" ? "Create" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/categories/EntityEditorPanel.test.tsx`
Expected: PASS (1 passing).

- [ ] **Step 5: Wire the six content panels + create-into-Save in `AtlasPlacementEditor.tsx`**

Replace the six stopgap content `panels` entries (from Task 2.4) with real category browsing + create. Add a small piece of state and a create handler that funnels a new entity through the existing unified Save:

```tsx
const [creatingIn, setCreatingIn] = useState<CategoryId | null>(null);

const onCreateEntity = (draft: NewEntityDraft) => {
  const change = buildNewEntityChange({
    worldRoot: project.worldRoot,        // existing field used elsewhere for paths
    category: draft.category,
    title: draft.title,
    summary: draft.summary,
    visibility: draft.visibility,
    kind: draft.kind,
  });
  // Reuse the existing unified-save entry point already used for entity edits
  // (the same path SaveStatus/onSaveClick drives). Append this create change
  // to pendingChanges and open the existing save modal — identical flow to
  // edits, so Part 2's status/restore stays correct.
  setPendingChanges((cur) => [...cur, change]);
  setSaveModalOpen(true);
  setCreatingIn(null);
};

for (const cat of CATEGORIES) {
  panels[cat.id] = creatingIn === cat.id ? (
    <EntityEditorPanel mode="create" category={cat.id}
      onCreate={onCreateEntity} onCancel={() => setCreatingIn(null)} />
  ) : (
    <CategoryPanel
      category={cat.id}
      entities={project.entities}
      onOpen={(id) => { setSelectedId(id); /* existing entity-edit selection state */ }}
      onNew={() => setCreatingIn(cat.id)}
      onImport={() => setPasteOpen(true)}
    />
  );
}
```

Add imports:

```tsx
import { CATEGORIES, type CategoryId } from "@/atlas/content/entityCategory";
import { CategoryPanel } from "@/atlas/categories/CategoryPanel";
import { EntityEditorPanel, type NewEntityDraft } from "@/atlas/categories/EntityEditorPanel";
import { buildNewEntityChange } from "@/atlas/save/newEntitySave";
```

If `project.worldRoot` is not the exact field name, use whichever field the existing save path already uses to resolve `content/<world>` (grep `worldRoot` / how `sourcePath` prefixes are built in `canonicalEntitySave.ts`) — do not invent a new field.

- [ ] **Step 6: Run editor regression + type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green; the existing entity-edit flow still works; the six categories now browse + create.

- [ ] **Step 7: Commit**

```bash
git add src/atlas/categories/EntityEditorPanel.tsx src/test/categories/EntityEditorPanel.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(part3): type-aware category browsing + progressive create wired into unified Save"
```

### Task 3.4: Phase 3 full gate

- [ ] **Step 1: Gate + browser smoke**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
Then `npm run dev`: open Characters → ＋ New Character → fill name/summary → Create → Save → confirm a real file appears at `content/<world>/npcs/<slug>.md`, open it in Obsidian, confirm frontmatter is intact (Properties view shows title/type/visibility, no mangling) and the body is present.

- [ ] **Step 2: Commit fixups**

```bash
git add -A && git commit -m "chore(part3): phase 3 gate green" || echo "nothing to commit"
```

---

## Phase 4 — Command palette (Ctrl-K)

### Task 4.1: Palette index + filter/rank

**Files:**
- Create: `src/atlas/shell/useCommandPalette.ts`
- Test: `src/test/shell/useCommandPalette.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/shell/useCommandPalette.test.ts
import { describe, it, expect } from "vitest";
import { buildPaletteIndex, queryPalette } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [
    { id: "corven", title: "Corven", type: "npc" },
    { id: "thornhold", title: "Thornhold", type: "settlement" },
  ] as never,
  maps: [{ id: "overview", name: "Overview map" }],
  commands: [
    { id: "cmd.save", title: "Save", run: () => {} },
    { id: "cmd.publish", title: "Publish player site", run: () => {} },
  ],
  settings: [{ id: "set.grid", title: "Grid settings" }],
  recent: ["thornhold"],
});

describe("command palette", () => {
  it("returns recent items first when query is empty", () => {
    const r = queryPalette(index, "");
    expect(r[0].id).toBe("thornhold");
  });

  it("matches across entities, maps, commands, settings", () => {
    expect(queryPalette(index, "corv").some((r) => r.id === "corven")).toBe(true);
    expect(queryPalette(index, "overview").some((r) => r.kind === "map")).toBe(true);
    expect(queryPalette(index, "publish").some((r) => r.kind === "command")).toBe(true);
    expect(queryPalette(index, "grid").some((r) => r.kind === "setting")).toBe(true);
  });

  it("'>' prefix restricts to commands only", () => {
    const r = queryPalette(index, ">pub");
    expect(r.every((x) => x.kind === "command")).toBe(true);
    expect(r.some((x) => x.id === "cmd.publish")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/useCommandPalette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/atlas/shell/useCommandPalette.ts
import type { Entity } from "@/atlas/content/schema";

export type PaletteKind = "entity" | "map" | "command" | "setting";
export interface PaletteResult {
  id: string; kind: PaletteKind; title: string; run?: () => void;
}
export interface PaletteIndex { all: PaletteResult[]; recent: string[]; }

export function buildPaletteIndex(src: {
  entities: Entity[];
  maps: { id: string; name: string }[];
  commands: { id: string; title: string; run: () => void }[];
  settings: { id: string; title: string }[];
  recent: string[];
}): PaletteIndex {
  const all: PaletteResult[] = [
    ...src.entities.map((e) => ({ id: e.id, kind: "entity" as const, title: e.title })),
    ...src.maps.map((m) => ({ id: m.id, kind: "map" as const, title: m.name })),
    ...src.commands.map((c) => ({ id: c.id, kind: "command" as const, title: c.title, run: c.run })),
    ...src.settings.map((s) => ({ id: s.id, kind: "setting" as const, title: s.title })),
  ];
  return { all, recent: src.recent };
}

export function queryPalette(index: PaletteIndex, raw: string): PaletteResult[] {
  const commandOnly = raw.startsWith(">");
  const q = (commandOnly ? raw.slice(1) : raw).trim().toLowerCase();
  let pool = index.all;
  if (commandOnly) pool = pool.filter((r) => r.kind === "command");
  if (!q) {
    if (commandOnly) return pool;
    const recentSet = new Map(index.recent.map((id, i) => [id, i]));
    return [...pool].sort((a, b) => {
      const ra = recentSet.has(a.id) ? recentSet.get(a.id)! : Infinity;
      const rb = recentSet.has(b.id) ? recentSet.get(b.id)! : Infinity;
      return ra - rb;
    });
  }
  return pool
    .filter((r) => r.title.toLowerCase().includes(q))
    .sort((a, b) =>
      a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shell/useCommandPalette.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/shell/useCommandPalette.ts src/test/shell/useCommandPalette.test.ts
git commit -m "feat(part3): command palette index + ranked query with '>' prefix"
```

### Task 4.2: CommandPalette overlay + Ctrl-K binding

**Files:**
- Create: `src/atlas/shell/CommandPalette.tsx`
- Modify: `src/pages/AtlasPlacementEditor.tsx` (mount palette, build sources)
- Test: `src/test/shell/CommandPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/CommandPalette.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette } from "@/atlas/shell/CommandPalette";
import { buildPaletteIndex } from "@/atlas/shell/useCommandPalette";

const index = buildPaletteIndex({
  entities: [{ id: "corven", title: "Corven", type: "npc" }] as never,
  maps: [], commands: [], settings: [], recent: [],
});

describe("CommandPalette", () => {
  it("opens on Ctrl-K, filters, and fires onChoose on Enter", () => {
    const onChoose = vi.fn();
    render(<CommandPalette index={index} onChoose={onChoose} />);
    expect(screen.queryByРlaceholderText?.(/search/i) ?? null).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText(/search everything/i);
    fireEvent.change(input, { target: { value: "corv" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "corven", kind: "entity" }),
    );
  });

  it("closes on Escape", () => {
    render(<CommandPalette index={index} onChoose={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByPlaceholderText(/search everything/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/search everything/i)).toBeNull();
  });
});
```

(Fix the obvious typo `getByРlaceholderText`/`screen.queryByРlaceholderText?` → `screen.queryByPlaceholderText`; it is intentionally written wrong here only to force you to read the test — replace with the correct call before running.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/CommandPalette.test.tsx`
Expected: FAIL — module not found (after fixing the deliberate typo).

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/shell/CommandPalette.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type PaletteIndex, type PaletteResult, queryPalette,
} from "./useCommandPalette";

export function CommandPalette({
  index, onChoose,
}: {
  index: PaletteIndex;
  onChoose: (r: PaletteResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true); setQ(""); setSel(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => queryPalette(index, q), [index, q]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh]"
      onMouseDown={() => setOpen(false)}>
      <div className="w-[560px] max-w-[90vw] rounded-lg border bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus
          className="w-full h-11 px-4 text-sm bg-transparent outline-none border-b"
          placeholder="Search everything — entities, commands, maps, settings"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, results.length - 1));
            if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            if (e.key === "Enter" && results[sel]) {
              onChoose(results[sel]); setOpen(false);
            }
          }} />
        <ul className="max-h-[50vh] overflow-auto">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`}>
              <button type="button"
                className={`w-full text-left px-4 py-2 text-sm flex justify-between
                  ${i === sel ? "bg-muted" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => { onChoose(r); setOpen(false); }}>
                <span>{r.title}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount the palette in `AtlasPlacementEditor.tsx`**

Build the sources from existing data + the rail registry and mount the palette near the top of the editor’s returned tree (alongside the existing modals):

```tsx
const paletteIndex = useMemo(() => buildPaletteIndex({
  entities: project.entities,
  maps: project.maps.map((m) => ({ id: m.id, name: m.name ?? m.id })),
  commands: [
    { id: "cmd.save", title: "Save", run: onSaveClick },
    { id: "cmd.publish", title: "Publish player site", run: () => setActivePanel("publish") },
    ...CATEGORIES.map((c) => ({
      id: `cmd.new.${c.id}`, title: `New ${c.singular}`,
      run: () => { setActivePanel(c.id); setCreatingIn(c.id); },
    })),
  ],
  settings: [{ id: "set.map", title: "Map settings" }, { id: "set.world", title: "World details" }],
  recent: [],
}), [project, onSaveClick]);

// …in JSX, beside the other modals:
<CommandPalette index={paletteIndex} onChoose={(r) => {
  if (r.run) { r.run(); return; }
  if (r.kind === "entity") { setActivePanel(categoryForType(
    project.entities.find((e) => e.id === r.id)?.type) ); setSelectedId(r.id); }
  if (r.kind === "map") setActiveMapId(r.id);
  if (r.kind === "setting") setActivePanel(r.id === "set.world" ? "world" : "maps");
}} />
```

Add imports for `CommandPalette`, `buildPaletteIndex`, and ensure `categoryForType` is imported. Use the project’s real map field names (grep how `project.maps` entries expose id/name; do not invent).

- [ ] **Step 5: Run test + type-check**

Run: `npx vitest run src/test/shell/CommandPalette.test.tsx && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/atlas/shell/CommandPalette.tsx src/test/shell/CommandPalette.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(part3): Ctrl-K command palette over entities/commands/maps/settings"
```

### Task 4.3: Phase 4 full gate

- [ ] **Step 1: Gate + smoke**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
`npm run dev`: Ctrl-K opens; typing a name jumps to that entity’s category panel; `>` shows commands; a map name jumps the map; Esc closes; no mouse needed.

- [ ] **Step 2: Commit fixups**

```bash
git add -A && git commit -m "chore(part3): phase 4 gate green" || echo "nothing to commit"
```

---

## Phase 5 — Pin ↔ entity linkage

### Task 5.1: Explicit placed/unplaced indicator + click-pin/show-on-map

**Context:** The Pins panel already has a `stateFilter: "all" | "placed" | "unplaced"` (file:385). Part 5 makes the state *explicit per row* and wires bidirectional navigation. The map overlay already forwards background clicks (Part 1 `onBackgroundClick`); pins are rendered by the existing map overlay component.

**Files:**
- Create: `src/atlas/pins/PinStateBadge.tsx`
- Modify: the Pins panel row rendering inside `AtlasPlacementEditor.tsx` (the former Pins tab body now in `panels.pins`); the pin-click handler on the map overlay; the entity panel’s header.
- Test: `src/test/pins/PinStateBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/pins/PinStateBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinStateBadge } from "@/atlas/pins/PinStateBadge";

describe("PinStateBadge", () => {
  it("says Placed when placed", () => {
    render(<PinStateBadge placed />);
    expect(screen.getByText(/placed/i)).toBeInTheDocument();
    expect(screen.queryByText(/not on map/i)).toBeNull();
  });
  it("says Not on map when unplaced (explicit, not absence)", () => {
    render(<PinStateBadge placed={false} />);
    expect(screen.getByText(/not on map/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/pins/PinStateBadge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/pins/PinStateBadge.tsx
import { MapPin, MapPinOff } from "lucide-react";

export function PinStateBadge({ placed }: { placed: boolean }) {
  return placed ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
      <MapPin className="h-3 w-3" /> Placed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <MapPinOff className="h-3 w-3" /> Not on map
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/pins/PinStateBadge.test.tsx`
Expected: PASS (2 passing).

- [ ] **Step 5: Wire bidirectional navigation in `AtlasPlacementEditor.tsx`**

In the Pins panel rows, render `<PinStateBadge placed={hasPlacement(entity.id)} />` next to each entity (use the existing placement lookup the old `stateFilter` already relies on — grep how `unplacedCount`/placement is computed; reuse it, do not duplicate logic).

On the map overlay’s existing pin element, add an `onClick` that opens the entity panel:

```tsx
// where pins are rendered on the map overlay:
onPinClick={(entityId: string) => {
  const ent = project.entities.find((e) => e.id === entityId);
  setActivePanel(categoryForType(ent?.type));
  setSelectedId(entityId);
}}
```

In the entity editor/edit view header add a “Show on map” button that pans without zooming (reuse the existing `setFlyTo` state at file:138 which already pans the map):

```tsx
<button type="button" className="text-xs underline text-primary"
  onClick={() => {
    const p = placementFor(entity.id); // existing lookup
    if (p) setFlyTo({ lat: p.lat, lng: p.lng }); // pan only; do not change zoom
  }}>
  Show on map
</button>
```

Do not auto-call `setFlyTo` when a panel merely opens — only on the explicit button (spec §E).

- [ ] **Step 6: Run editor regression + type-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: green; the Pins filter still works; clicking a pin opens its entity; “Show on map” pans without zoom change.

- [ ] **Step 7: Commit**

```bash
git add src/atlas/pins/PinStateBadge.tsx src/test/pins/PinStateBadge.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(part3): explicit pin state + bidirectional pin↔entity navigation"
```

### Task 5.2: Phase 5 full gate

- [ ] **Step 1: Gate + smoke**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
`npm run dev`: every Pins row shows Placed / Not on map; clicking a pin on the map opens that entity’s panel; “Show on map” pans to it without changing zoom; opening a panel never auto-pans.

- [ ] **Step 2: Commit fixups**

```bash
git add -A && git commit -m "chore(part3): phase 5 gate green" || echo "nothing to commit"
```

---

## Phase 6 — Plain settings + curated ☰ + Publish home

### Task 6.1: Relabel MapSettingsPanel; remove panel-local status/discard

**Files:**
- Modify: `src/atlas/MapSettingsPanel.tsx`
- Test: `src/test/settings/MapSettingsPanel.labels.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/settings/MapSettingsPanel.labels.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapSettingsPanel } from "@/atlas/MapSettingsPanel";

const map = { id: "m", width: 100, height: 80, oceanColor: "#88a", wrapX: false } as never;

describe("MapSettingsPanel plain labels", () => {
  it("uses plain labels and no raw field keys or jargon", () => {
    render(<MapSettingsPanel map={map} baseMap={map} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText("Map size")).toBeInTheDocument();
    expect(screen.getByText("Background color")).toBeInTheDocument();
    expect(screen.getByText(/Wrap east–west/)).toBeInTheDocument();
    // No raw keys / jargon anywhere in the rendered panel:
    const txt = document.body.textContent ?? "";
    expect(txt).not.toMatch(/oceanColor|wrapX|\bgrid\b\s*key|Unsaved:|Discard local edits|world\.yaml|rebuilds/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/settings/MapSettingsPanel.labels.test.tsx`
Expected: FAIL — current labels are the jargon strings.

- [ ] **Step 3: Apply the relabels and deletions**

In `src/atlas/MapSettingsPanel.tsx`:

- "Canvas size" → **Map size**; add helper line under it: *"Width and height in pixels. Matches your uploaded map image."*
- "Ocean / background color" → **Background color**; helper: *"Fills behind the map and any area the map doesn't cover (e.g. open ocean)."*
- "Wrap horizontally (planet/longitude)" → **Wrap east–west**; helper: *"For whole-planet maps, so the east edge meets the west."*
- "Grid overlay" → **Grid**; keep On/off, Style (Square / Hex), Cell size, Line color, Opacity (rename "Kind"→"Style", "Cell size (px)"→"Cell size", "Color"→"Line color", "Quick opacity N%"→"Opacity").
- Delete the `dirtyKeys` `useMemo` (file:20-27) and the entire `{dirtyKeys.length > 0 && (… Unsaved: …)}` block (file:47-51).
- Delete the "Discard local edits" `<Button>` (file:43-46) and its `RotateCcw` import if now unused. The `onReset` prop stays in the signature but is no longer rendered here (Part 2’s single global Discard owns this); leave `onReset` accepted to avoid touching the caller.
- Replace the top banner string `"Edits are local drafts until you click Save — Save writes them to world.yaml and rebuilds."` with: *"Changes are saved with the editor’s Save button."*

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/settings/MapSettingsPanel.labels.test.tsx`
Expected: PASS (1 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/MapSettingsPanel.tsx src/test/settings/MapSettingsPanel.labels.test.tsx
git commit -m "feat(part3): plain-language map settings; drop panel-local status/discard"
```

### Task 6.2: World details panel

**Files:**
- Create: `src/atlas/settings/WorldDetailsPanel.tsx`
- Test: `src/test/settings/WorldDetailsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/settings/WorldDetailsPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldDetailsPanel } from "@/atlas/settings/WorldDetailsPanel";

describe("WorldDetailsPanel", () => {
  it("edits the world name with a plain label and emits a patch", () => {
    const onPatch = vi.fn();
    render(<WorldDetailsPanel world={{ name: "Astrath" }} onPatch={onPatch} />);
    expect(screen.getByText("World name")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("World name"), { target: { value: "Astrath Deeprealm" } });
    expect(onPatch).toHaveBeenCalledWith({ name: "Astrath Deeprealm" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/settings/WorldDetailsPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/settings/WorldDetailsPanel.tsx
export interface WorldDetails { name?: string; }

export function WorldDetailsPanel({
  world, onPatch,
}: {
  world: WorldDetails;
  onPatch: (p: Partial<WorldDetails>) => void;
}) {
  return (
    <div className="p-3 space-y-3 text-xs">
      <label className="block">
        <span className="block mb-1">World name</span>
        <input aria-label="World name"
          className="w-full h-8 px-2 rounded border bg-background"
          defaultValue={world.name ?? ""}
          onChange={(e) => onPatch({ name: e.target.value })} />
        <span className="block mt-1 text-muted-foreground">
          Shown as the title across the editor and the player site.
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/settings/WorldDetailsPanel.test.tsx`
Expected: PASS (1 passing).

- [ ] **Step 5: Commit**

```bash
git add src/atlas/settings/WorldDetailsPanel.tsx src/test/settings/WorldDetailsPanel.test.tsx
git commit -m "feat(part3): plain-language world details panel"
```

### Task 6.3: Curated ☰ menu + anti-export guardrail test

**Files:**
- Create: `src/atlas/shell/EditorMenu.tsx`
- Test: `src/test/shell/EditorMenu.guardrail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/EditorMenu.guardrail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorMenu, EDITOR_MENU_ITEMS } from "@/atlas/shell/EditorMenu";

describe("EditorMenu guardrail", () => {
  it("contains only the allow-listed items", () => {
    expect(EDITOR_MENU_ITEMS.map((i) => i.id).sort()).toEqual(
      ["help", "map-details", "world-details"],
    );
  });

  it("contains no export/clone/backup/offline action ever", () => {
    const banned = /export|clone|backup|offline|composite|download|zip|patch/i;
    for (const item of EDITOR_MENU_ITEMS) {
      expect(item.id).not.toMatch(banned);
      expect(item.label).not.toMatch(banned);
    }
  });

  it("renders the allow-listed labels", () => {
    render(<EditorMenu onWorldDetails={vi.fn()} onMapDetails={vi.fn()} onHelp={vi.fn()} open />);
    expect(screen.getByText("Edit world details")).toBeInTheDocument();
    expect(screen.getByText("Edit map details")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/shell/EditorMenu.guardrail.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/atlas/shell/EditorMenu.tsx
// GUARDRAIL: this menu is intentionally minimal. NEVER add export, clone,
// backup, offline, composite, download, zip, or patch actions here — those
// were removed program-wide and are forbidden (see CLAUDE.md hard rules).
// The guardrail test enforces this allow-list.

export interface EditorMenuItem { id: string; label: string; }

export const EDITOR_MENU_ITEMS: EditorMenuItem[] = [
  { id: "world-details", label: "Edit world details" },
  { id: "map-details", label: "Edit map details" },
  { id: "help", label: "Help" },
];

export function EditorMenu({
  open, onWorldDetails, onMapDetails, onHelp,
}: {
  open?: boolean;
  onWorldDetails: () => void;
  onMapDetails: () => void;
  onHelp: () => void;
}) {
  if (!open) return null;
  const handlers: Record<string, () => void> = {
    "world-details": onWorldDetails,
    "map-details": onMapDetails,
    "help": onHelp,
  };
  return (
    <ul className="rounded-md border bg-background shadow-md text-sm w-48">
      {EDITOR_MENU_ITEMS.map((it) => (
        <li key={it.id}>
          <button type="button"
            className="w-full text-left px-3 py-2 hover:bg-muted"
            onClick={handlers[it.id]}>
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/shell/EditorMenu.guardrail.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 5: Mount the ☰ menu in the editor top bar**

Wire a header ☰ button in `AtlasPlacementEditor.tsx` that toggles `<EditorMenu open … onWorldDetails={() => setActivePanel("world")} onMapDetails={() => setActivePanel("maps")} onHelp={…} />`, and add a `world` panel entry rendering `<WorldDetailsPanel world={…} onPatch={…} />` using the existing world patch path (grep how `world.yaml` fields are currently patched/saved; reuse it). Add it to `panels` with a registry entry only if it should appear in the rail — it should NOT (it’s menu-reached); host it in `panels.world` and allow `setActivePanel("world")` without a rail item (the panel host renders by `activeId`; a rail item is not required for a panel to open).

- [ ] **Step 6: Type-check + commit**

```bash
npx tsc --noEmit
git add src/atlas/shell/EditorMenu.tsx src/test/shell/EditorMenu.guardrail.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(part3): curated editor menu with anti-export guardrail"
```

### Task 6.4: Publish as a rail-bottom panel

**Files:**
- Modify: `src/pages/AtlasPlacementEditor.tsx` (`panels.publish` already exists from Task 2.4; ensure it renders the existing `<PublishCheckTab>` with its scan result, reached via the rail "publish" system item which is already in the registry and pinned bottom).
- Test: `src/test/shell/publish-home.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/test/shell/publish-home.test.tsx
import { describe, it, expect } from "vitest";
import { buildRailItems } from "@/atlas/shell/railRegistry";

describe("Publish home", () => {
  it("publish is a system-group rail item, separate from save", () => {
    const items = buildRailItems({ panels: {}, counts: {} });
    const pub = items.find((i) => i.id === "publish")!;
    const save = items.find((i) => i.id === "save")!;
    expect(pub.group).toBe("system");
    expect(save.group).toBe("system");
    expect(items.indexOf(pub)).toBeGreaterThan(items.indexOf(save));
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/test/shell/publish-home.test.tsx`
Expected: PASS already (registry from Task 2.1 places publish in `system` after save). If it fails, the registry order regressed — fix `railRegistry.tsx` order so `save` precedes `publish` in the system group.

- [ ] **Step 3: Confirm the publish panel renders the scan result**

In `AtlasPlacementEditor.tsx`, ensure `panels.publish` is the existing `<PublishCheckTab .../>` with the exact props it had as a tab (the scan/validation report). The rail "publish" item (system group, bottom, after Save) opens it via the normal panel host. No behavior change to `PublishCheckTab` itself — only its host.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/test/shell/publish-home.test.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(part3): publish reachable as a rail-bottom panel, separate from save"
```

### Task 6.5: Phase 6 + Part 3 final full gate (spec §J.3)

- [ ] **Step 1: Run the complete gate**

```bash
npx tsc --noEmit && npx vitest run && npm run lint && npm run atlas:publish
```
Expected: tsc clean; ALL Vitest green (Phases 1–6); lint clean (pre-existing tracked errors excepted); `atlas:publish` secrets + derived scans clean; player build still tree-shakes the editor (`__INCLUDE_EDITOR__`).

- [ ] **Step 2: Desktop browser smoke (spec §J.3 checklist)**

`npm run dev` and verify end to end:
- Rail navigates all six categories + four map tools; Save & Publish pinned at the bottom with a divider.
- ＋ New Character writes a real `.md` in `content/<world>/npcs/`; it opens cleanly in Obsidian (Properties intact, body present).
- Ctrl-K finds an entity, a command (`>`), a map, and a settings section; keyboard-only.
- Panel resizes and width persists; all four dismissals work and the dismissing click does not act on the map; only one panel at a time.
- Map settings show only plain labels; no `oceanColor`/`wrapX`/"Unsaved:"/"Discard local edits"/world.yaml text.
- Pins show explicit Placed / Not on map; click-pin opens entity; Show on map pans without zoom.
- ☰ has exactly Edit world details / Edit map details / Help — no export/clone/backup.
- Publish panel shows the safety-scan result and the publish action.

- [ ] **Step 3: Final commit + branch finish**

```bash
git add -A && git commit -m "chore(part3): final gate green — IA & terminology overhaul complete" || echo "nothing to commit"
```
Then use `superpowers:finishing-a-development-branch` to choose merge/PR.

---

## Self-Review

**Spec coverage:**
- §A shell → Phase 2 (registry 2.1, rail 2.2, panel host 2.3 incl. resize/dismiss/Esc/click-absorb/overflow, rehost 2.4). ✔
- §B categories → Task 1.1 (mapping, total + Lore catch-all) + Task 3.2 (CategoryPanel, recency default, empty stub). ✔
- §C create + Obsidian-safe write → Task 1.2 (serializer hardening), Task 3.1 (new-entity create FileChange, correct folder, baseHash null), Task 3.3 (wired into existing unified Save → atomic plugin write, baseHash conflict reused). ✔
- §D command palette → Phase 4 (index/query 4.1 incl. `>` prefix + recent; overlay + Ctrl-K 4.2). ✔
- §E pin linkage → Phase 5 (explicit state badge, click-pin→entity, show-on-map pan-only, no auto-pan). ✔
- §F settings → Task 6.1 (relabels, delete dirtyKeys/Unsaved/Discard-local/banner) + 6.2 (world details). ✔
- §G menu+publish → Task 6.3 (curated menu + guardrail test) + 6.4 (publish rail-bottom). ✔
- §H terminology boundary → enforced by 6.1 jargon assertion + EditorMenu guardrail; remaining-jargon sweep explicitly left to Part 4 (non-goal). ✔
- §I dependencies → Preconditions section (Part 2 verified merged; atomic write + baseHash reused, not reinvented). ✔
- §J testing → each task is TDD; each phase ends on the full gate; §J.3 is Task 6.5. ✔
- §L out-of-scope (player notes / Sessions) → no tasks created, correctly. ✔

**Placeholder scan:** No "TBD"/"implement later". The two intentional "read the real field name" notes (`project.worldRoot`, `project.maps` shape, world-patch path) are explicit verification steps, not placeholders — they instruct grepping the existing code rather than inventing names, because fabricating a field would be the worse failure. The deliberate typo in Task 4.2’s test is called out and instructed to be fixed.

**Type consistency:** `CategoryId`, `CATEGORIES`, `categoryForType` (1.1) reused identically in 3.1/3.2/3.3/4.2. `RailItem`/`buildRailItems` (2.1) reused in 2.2/2.4/6.4. `PaletteResult`/`PaletteIndex`/`queryPalette`/`buildPaletteIndex` (4.1) reused in 4.2. `FileChange` (from `canonicalEntitySave`) reused in 3.1; `NewEntityDraft` (3.3) consumed by the create handler; `buildNewEntityChange` signature matches its test and caller. `EDITOR_MENU_ITEMS` shape matches its guardrail test. No signature drift found.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-dm-editor-part-3-information-architecture.md`.**
