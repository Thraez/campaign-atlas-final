import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";

const RAW =
  "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n  secrets:\n" +
  "    - id: sec1\n      for: Aria\n      reveal: Old reveal text\n---\nBody\n";

// A hand-edited keys file: a nested entry (not a character with a key), a
// commented-out line and a numeric key.
const KEYS = "Aria: k1\nBob:\n  inner: x\n# Cara: old\nDag: 12345\n";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  readSourceFile: vi.fn(async (path: string) =>
    path.endsWith("character-keys.yaml") ? KEYS : RAW,
  ),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "hash-v1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

function EditHost() {
  const api = useEntityEditDraft();
  return (
    <EntityEditPanel
      sourcePath="content/w/npcs/corven.md"
      draftApi={api}
      onClose={() => {}}
      onSaved={() => {}}
    />
  );
}

describe("EntityEditPanel — the secret's character list reads character-keys.yaml like the keys panel (eval-2026-10/36)", () => {
  it("offers only characters that have a key, not nested lines", async () => {
    render(<EditHost />);
    const select = await screen.findByLabelText("Character for secret");
    await waitFor(() =>
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["— pick a character —", "Aria", "Dag"]),
    );
  });
});
