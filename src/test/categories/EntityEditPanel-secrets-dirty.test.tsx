import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { resolveEntityCloseIntent } from "@/atlas/editor/entityCloseIntent";

const RAW =
  "---\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n  secrets:\n" +
  "    - id: sec1\n      for: Aria\n      reveal: Old reveal text\n---\nBody\n";

vi.mock("@/atlas/save/canonicalPlacementSave", () => ({
  // Also used to fetch the DM character-keys.yaml (for the secret "for:"
  // dropdown) — reject that path so it falls back to a plain text input
  // instead of parsing "names" out of this test's entity frontmatter.
  readSourceFile: vi.fn(async (path: string) => {
    if (path.endsWith("character-keys.yaml")) throw new Error("no keys file in this test");
    return RAW;
  }),
}));
vi.mock("@/atlas/save/localFsSave", () => ({
  hashContent: vi.fn(async () => "hash-v1"),
  saveAtlasPatchToLocalFs: vi.fn(async () => {}),
}));

/**
 * N99: editing an existing secret's fields must flip the shared draft's
 * isDirty() — previously the secret list lived in component-local state that
 * the dirty fingerprint never saw, so a Close after a secret edit silently
 * discarded it with no confirm.
 */
function EditHost({ sourcePath }: { sourcePath: string }) {
  const api = useEntityEditDraft();
  return (
    <>
      <div data-testid="dirty">{String(api.isDirty())}</div>
      <EntityEditPanel
        sourcePath={sourcePath}
        draftApi={api}
        onClose={() => {}}
        onSaved={() => {}}
      />
    </>
  );
}

describe("EntityEditPanel — secret edits mark the draft dirty (N99)", () => {
  it("editing an existing secret's reveal text flips isDirty from false to true", async () => {
    render(<EditHost sourcePath="content/w/npcs/corven.md" />);

    await waitFor(() => screen.getByDisplayValue("Old reveal text"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");

    fireEvent.change(screen.getByDisplayValue("Old reveal text"), {
      target: { value: "New reveal text" },
    });

    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("editing a secret's character field also flips isDirty", async () => {
    render(<EditHost sourcePath="content/w/npcs/corven.md" />);

    // No character-keys.yaml is mocked here, so the field falls back to a
    // plain text input (identified by its placeholder, not an aria-label).
    await waitFor(() => screen.getByPlaceholderText("Character name"));
    expect(screen.getByTestId("dirty")).toHaveTextContent("false");

    fireEvent.change(screen.getByPlaceholderText("Character name"), {
      target: { value: "Bren" },
    });

    expect(screen.getByTestId("dirty")).toHaveTextContent("true");
  });

  it("resolveEntityCloseIntent asks for confirmation once a secret edit is in flight", async () => {
    render(<EditHost sourcePath="content/w/npcs/corven.md" />);
    await waitFor(() => screen.getByDisplayValue("Old reveal text"));

    fireEvent.change(screen.getByDisplayValue("Old reveal text"), {
      target: { value: "New reveal text" },
    });

    const dirty = screen.getByTestId("dirty").textContent === "true";
    expect(resolveEntityCloseIntent({ dirty })).toEqual({ kind: "confirm-discard" });
  });
});
