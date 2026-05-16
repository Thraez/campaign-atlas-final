import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ImportStagingModal } from "@/atlas/import/ImportStagingModal";
import {
  buildStagingRows,
  updateStagingRow,
  type StagingRow,
  type StagingContext,
} from "@/atlas/import/stagingState";
import type { ImportFolderConfig } from "@/atlas/content/schema";

const WORLD = "astrath-deeprealm";

/** Mirrors content/astrath-deeprealm/_atlas/world.yaml import block. */
const TEST_IMPORT_CONFIG: ImportFolderConfig = {
  folders: {
    npc: "npcs",
    settlement: "settlements",
    ruin: "ruins",
    dungeon: "ruins",
    location: "places",
    map_note: "places",
    faction: "factions",
    event: "events",
    region: "regions",
    item: "items",
  },
  defaultFolder: "imports",
};

const TEST_ALLOWED_FOLDERS: ReadonlySet<string> = new Set([
  ...Object.values(TEST_IMPORT_CONFIG.folders),
  TEST_IMPORT_CONFIG.defaultFolder,
]);

function makeCtx(overrides?: {
  existingById?: ReadonlyMap<string, string>;
  existingPaths?: ReadonlySet<string>;
}): StagingContext {
  return {
    worldId: WORLD,
    importConfig: TEST_IMPORT_CONFIG,
    allowedFolders: TEST_ALLOWED_FOLDERS,
    existingById: overrides?.existingById ?? new Map(),
    existingPaths: overrides?.existingPaths ?? new Set(),
  };
}

function Harness({
  initial,
  ctx = makeCtx(),
  onCommit,
}: {
  initial: StagingRow[];
  ctx?: StagingContext;
  onCommit?: (committed: StagingRow[]) => void;
}) {
  const [rows, setRows] = useState(initial);
  return (
    <ImportStagingModal
      open
      rows={rows}
      onPatchRow={(id, patch) =>
        setRows((rs) =>
          rs.map((r) =>
            r.id === id ? updateStagingRow(r, patch, ctx) : r,
          ),
        )
      }
      onCancel={() => {}}
      onCommit={() => onCommit?.(rows.filter((r) => r.included && r.pathAllowed && !r.parseError))}
    />
  );
}

describe("ImportStagingModal", () => {
  it("renders one row per input file with filename, type select, and target path", () => {
    const rows = buildStagingRows(
      [
        { filename: "thornhold.md", raw: "---\natlas: { type: settlement, id: thornhold }\n---\n" },
        { filename: "garron.md", raw: "---\natlas: { type: npc, id: garron }\n---\n" },
      ],
      makeCtx(),
    );
    render(<Harness initial={rows} />);
    expect(screen.getByText("thornhold.md")).toBeTruthy();
    expect(screen.getByText("garron.md")).toBeTruthy();
    expect(
      screen.getByDisplayValue("content/astrath-deeprealm/settlements/thornhold.md"),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue("content/astrath-deeprealm/npcs/garron.md"),
    ).toBeTruthy();
  });

  it("Import button reflects the count of included rows", () => {
    const rows = buildStagingRows(
      [
        { filename: "a.md", raw: "---\natlas: { type: npc, id: a }\n---\n" },
        { filename: "b.md", raw: "---\natlas: { type: npc, id: b }\n---\n" },
      ],
      makeCtx(),
    );
    render(<Harness initial={rows} />);
    expect(screen.getByRole("button", { name: /^Import 2 files$/ })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Include a.md"));
    expect(screen.getByRole("button", { name: /^Import 1 file$/ })).toBeTruthy();
  });

  it("path-collision row defaults unchecked, shows warning badge, and re-check enables overwrite", () => {
    const existingPaths = new Set(["content/astrath-deeprealm/settlements/thornhold.md"]);
    const ctx = makeCtx({ existingPaths });
    const rows = buildStagingRows(
      [
        { filename: "thornhold.md", raw: "---\natlas: { type: settlement, id: thornhold }\n---\n" },
      ],
      ctx,
    );
    render(<Harness initial={rows} ctx={ctx} />);
    const cb = screen.getByLabelText("Include thornhold.md") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    expect(screen.getByText(/File exists — check to overwrite/i)).toBeTruthy();
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
    expect(screen.getByText(/Will overwrite — existing file backed up/i)).toBeTruthy();
  });

  it("disallowed-path row is uncheckable and Import button disabled", () => {
    const rows = buildStagingRows(
      [{ filename: "x.md", raw: "---\natlas: { type: npc, id: x }\n---\n" }],
      makeCtx(),
    );
    render(<Harness initial={rows} />);
    const path = screen.getByDisplayValue(
      "content/astrath-deeprealm/npcs/x.md",
    ) as HTMLInputElement;
    fireEvent.change(path, {
      target: { value: "content/astrath-deeprealm/_atlas/world.yaml" },
    });
    const cb = screen.getByLabelText("Include x.md") as HTMLInputElement;
    expect(cb.disabled).toBe(true);
    expect(cb.checked).toBe(false);
    expect(screen.getByText(/Outside allowlist/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /^Import 0 files$/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Cancel calls onCancel without committing", () => {
    const onCommit = vi.fn();
    const rows = buildStagingRows(
      [{ filename: "a.md", raw: "---\natlas: { type: npc, id: a }\n---\n" }],
      makeCtx(),
    );
    render(<Harness initial={rows} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
