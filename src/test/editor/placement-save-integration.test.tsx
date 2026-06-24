/**
 * Render-level integration test for the DM placement editor's Save flow.
 *
 * Commit 7ec439a2 fixed three QA findings whose call-site wiring was, until
 * now, only covered by isolated unit tests:
 *
 *   B3 — onSaveClick must run the dirty-gate (filterDirtyPlacements) at the
 *        actual save call site, so a clean Save writes nothing instead of
 *        rewriting every placed entity's .md. The gate lives in the
 *        buildSavePlan seam (src/atlas/editor/saveGate.ts) that the page's
 *        onSaveClick delegates to; this test drives that same seam, so a
 *        regression that stops filtering would fail here.
 *   W2 — the toolbar Save button is disabled while the session is "clean"
 *        and enabled once a placement is overridden.
 *   B1 — confirming then cancelling the review modal must recover the session
 *        to "unsaved" (not strand it on "saving") and re-enable Save.
 *
 * AtlasPlacementEditor mounts Leaflet + dozens of deps, so the established
 * codebase convention (e.g. entity-noloss-invariant.test.tsx) is a thin host
 * that wires the REAL collaborators the way the page does. Here that means the
 * real useEditorSession, the real DiffPreviewModal, and the real buildSavePlan
 * seam — only the page's surrounding orchestration (which is inseparable from
 * its hook soup) is mirrored.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCallback, useState } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { DiffPreviewModal } from "@/atlas/save/DiffPreviewModal";
import { useEditorSession, SESSION_IDB_KEY } from "@/atlas/session/useEditorSession";
import { idbDelete } from "@/atlas/session/idbStore";
import { buildSavePlan } from "@/atlas/editor/saveGate";
import type { FileChange } from "@/atlas/save/localFsSave";

// The harness drives toast.info for the "No changes to save" gate.
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

// The real DiffPreviewModal POSTs through saveAtlasPatchToLocalFs on confirm.
// Make that write hang so the modal stays in its "saving" phase deterministically
// — that is the exact window in which the B1 cancel-recovery must fire. The
// error classes the modal imports from this module are preserved via the
// original module so its catch block stays type-correct.
vi.mock("@/atlas/save/localFsSave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/atlas/save/localFsSave")>();
  return {
    ...actual,
    saveAtlasPatchToLocalFs: vi.fn(() => new Promise<never>(() => {})),
  };
});

type Draft = { entityId: string; mapId: string; x: number; y: number };

/**
 * Mirrors AtlasPlacementEditor's save wiring without the map canvas:
 *  - useEditorSession with fake holders driven by an overrides map (key
 *    presence = dirty), exactly like useEditorSession.test.tsx.
 *  - onSaveClick (~line 789) delegates the dirty-gate to buildSavePlan, then
 *    either fires the "No changes to save" toast or opens the review modal.
 *  - the toolbar Save button reproduces the W2 disabled gate (line 1186).
 *  - DiffPreviewModal reproduces the page's onConfirm/onClose wiring
 *    (lines 1695 / 1806-1812) that B1 depends on.
 */
function SaveHarness({
  mapId = "m1",
  initialOverrides = {},
  draftPlacements = [],
}: {
  mapId?: string;
  initialOverrides?: Record<string, { x: number; y: number }>;
  draftPlacements?: Draft[];
}) {
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>(initialOverrides);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<FileChange[]>([]);

  // perMapDirtyCount closes over the current overrides state (recomputed when it
  // changes), mirroring how the page derives its honest dirty count. No refs —
  // useEditorSession reads holders/count from the latest render, exactly like
  // useEditorSession.test.tsx's fake-holder harness.
  const perMapDirtyCount = useCallback(
    () => Object.keys(overrides).filter((k) => k.startsWith(`${mapId}:`)).length,
    [overrides, mapId],
  );

  const session = useEditorSession({
    activeMapId: mapId,
    undoStack: { clear: () => {} },
    holders: {
      overrides: {
        get: () => overrides,
        set: (o: Record<string, unknown>) => setOverrides(o as Record<string, { x: number; y: number }>),
      },
      mapOverride: { get: () => ({}), set: () => {} },
      region: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      route: { snapshot: () => ({ edits: {}, added: [], deleted: [] }), applySnapshot: () => {} },
      fog: { snapshot: () => null, applySnapshot: () => {} },
      layer: { snapshot: () => ({}), applySnapshot: () => {} },
      editorEntity: { get: () => null, set: () => {} },
    },
    perMapDirtyCount,
  });

  // Mirrors AtlasPlacementEditor.onSaveClick: the B3 dirty-gate is delegated to
  // buildSavePlan, then either the "No changes" toast fires or the review modal
  // opens. The exact FileChange content is exercised by canonicalEntitySave
  // tests — here a representative entity-md change per dirty placement is enough
  // for the modal to render.
  const onSaveClick = () => {
    const plan = buildSavePlan({
      allDraftPlacements: draftPlacements,
      overrides,
      activeMapId: mapId,
      entityDrafts: {},
      projectEntities: [],
      worldYamlDirty: false,
    });
    if (plan.isEmpty) {
      toast.info("No changes to save");
      return;
    }
    setPendingChanges(
      plan.dirtyPlacements.map((d) => ({
        path: `content/${d.entityId}.md`,
        content: "stub",
        kind: "entity-md" as const,
        baseHash: "h0",
      })),
    );
    setSaveModalOpen(true);
  };

  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="pending-count">{pendingChanges.length}</span>

      {/* Command-palette / keyboard / rail save path — reachable even when the
          session is clean (AtlasPlacementEditor lines 1010 / 1549). The B3 gate
          is the only thing protecting a clean Save invoked this way. */}
      <button data-testid="cmd-save" onClick={onSaveClick}>cmd save</button>

      {/* Toolbar Save — reproduces the W2 disabled gate (line 1186). */}
      <button
        data-testid="toolbar-save"
        onClick={onSaveClick}
        disabled={saveModalOpen || session.status === "clean"}
      >
        Save
      </button>

      {/* Stand-in for the DM creating a local pin override on the active map. */}
      <button
        data-testid="add-override"
        onClick={() => setOverrides((prev) => ({ ...prev, [`${mapId}:hero`]: { x: 1, y: 2 } }))}
      >
        add override
      </button>

      <DiffPreviewModal
        open={saveModalOpen}
        changes={pendingChanges}
        rebuildAfterSave={false}
        onConfirm={() => session.markSaving()}
        onWriteFailed={(m) => session.markFailed(m)}
        onSaved={() => { void session.markSaved(); }}
        onClose={() => {
          setSaveModalOpen(false);
          setPendingChanges([]);
          // B1: a confirmed-then-cancelled review left status on "saving"; drop
          // it back to the true dirty state so Save re-enables without a reload.
          if (session.status === "saving") session.markIdle();
        }}
      />
    </div>
  );
}

describe("buildSavePlan (save-gate seam)", () => {
  it("drops canon-only placements (no override key) — clean Save writes nothing", () => {
    const plan = buildSavePlan({
      allDraftPlacements: [{ entityId: "ghost", mapId: "m1", x: 5, y: 5 }],
      overrides: {},
      activeMapId: "m1",
      entityDrafts: {},
      projectEntities: [],
      worldYamlDirty: false,
    });
    expect(plan.dirtyPlacements).toEqual([]);
    expect(plan.frontmatterPatches).toEqual([]);
    expect(plan.isEmpty).toBe(true);
  });

  it("keeps a placement the DM overrode this session", () => {
    const plan = buildSavePlan({
      allDraftPlacements: [{ entityId: "hero", mapId: "m1", x: 1, y: 2 }],
      overrides: { "m1:hero": { x: 1, y: 2 } },
      activeMapId: "m1",
      entityDrafts: {},
      projectEntities: [],
      worldYamlDirty: false,
    });
    expect(plan.dirtyPlacements).toHaveLength(1);
    expect(plan.isEmpty).toBe(false);
  });

  it("is not empty when only world.yaml is dirty", () => {
    const plan = buildSavePlan({
      allDraftPlacements: [],
      overrides: {},
      activeMapId: "m1",
      entityDrafts: {},
      projectEntities: [],
      worldYamlDirty: true,
    });
    expect(plan.dirtyPlacements).toEqual([]);
    expect(plan.isEmpty).toBe(false);
  });
});

describe("placement Save flow — render-level integration", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    cleanup();
    await idbDelete(SESSION_IDB_KEY);
  });

  // B3: the dirty-gate must run at the actual save call site.
  it("clean session: Save shows 'No changes to save' and opens no diff modal", async () => {
    // A canon-only placement (no override key). buildDraftPlacements() would
    // return it, but the B3 filter must drop it so a clean Save writes nothing.
    render(
      <SaveHarness
        mapId="m1"
        initialOverrides={{}}
        draftPlacements={[{ entityId: "ghost", mapId: "m1", x: 5, y: 5 }]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("clean"));

    fireEvent.click(screen.getByTestId("cmd-save"));

    expect(toast.info).toHaveBeenCalledWith("No changes to save");
    expect(screen.getByTestId("pending-count")).toHaveTextContent("0");
    // The multi-file diff modal must NOT open.
    expect(screen.queryByText(/will be written/i)).not.toBeInTheDocument();
  });

  // W2: toolbar Save disabled when clean, enabled once a placement is overridden.
  it("toolbar Save is disabled when clean and enabled after an override", async () => {
    render(<SaveHarness mapId="m1" initialOverrides={{}} draftPlacements={[]} />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("clean"));

    expect(screen.getByTestId("toolbar-save")).toBeDisabled();

    fireEvent.click(screen.getByTestId("add-override"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unsaved"));
    expect(screen.getByTestId("toolbar-save")).toBeEnabled();
  });

  // B1: confirm then cancel must not strand the session on "saving".
  it("confirm-then-cancel recovers to 'unsaved' and re-enables Save", async () => {
    render(
      <SaveHarness
        mapId="m1"
        initialOverrides={{ "m1:hero": { x: 1, y: 2 } }}
        draftPlacements={[{ entityId: "hero", mapId: "m1", x: 1, y: 2 }]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unsaved"));

    // Open the review modal from the toolbar (enabled because the session is dirty).
    fireEvent.click(screen.getByTestId("toolbar-save"));
    const confirm = await screen.findByRole("button", { name: /save to disk/i });

    // Confirm → a real write begins → session flips to "saving" (the write hangs).
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("saving"));

    // Cancel the in-flight review.
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unsaved"));
    expect(screen.getByTestId("toolbar-save")).toBeEnabled();
  });
});
