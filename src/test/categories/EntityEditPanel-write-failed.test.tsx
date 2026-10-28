import { it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";

/**
 * Ticket eval-2026-10/33: a write that fails and is rolled back (207
 * WriteFailed) is not a save. The panel must keep the DM's edit, not call
 * onSaved, and say which file failed. Only fetch is faked, with the save
 * endpoint's real reply for a rolled-back batch.
 */
const PATH = "content/w/npcs/corven.md";
const V1 = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\n\n# Corven\n\nold body\n`;

function fakeServer() {
  const saves: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: V1 }), { status: 200 });
    }
    if (u.startsWith("/__atlas/save")) {
      saves.push(String(init!.body));
      return new Response(
        JSON.stringify({
          error: "WriteFailed",
          partialWrite: true,
          saved: 0,
          rolledBack: 0,
          failedPath: PATH,
          writeError: "EACCES: permission denied",
        }),
        { status: 207 },
      );
    }
    return new Response(JSON.stringify({ images: [] }), { status: 200 });
  });
  return { saves, fetchMock };
}

/** Owns the draft like AtlasPlacementEditor does, so it outlives the panel. */
function Host({ show, onSaved }: { show: boolean; onSaved: () => void }) {
  const api = useEntityEditDraft();
  return show ? (
    <EntityEditPanel sourcePath={PATH} draftApi={api} onClose={() => {}} onSaved={onSaved} />
  ) : null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("a rolled-back write keeps the edit, never calls onSaved, and names the failed file", async () => {
  const { saves, fetchMock } = fakeServer();
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  const { rerender } = render(<Host show onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(saves).toHaveLength(1));
  await waitFor(() => expect(screen.getByText(/EACCES/)).toBeInTheDocument());
  expect(screen.getByText(new RegExp(`Could not write ${PATH}`))).toBeInTheDocument();
  expect(screen.queryByText(/^Saved\.$/)).not.toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();

  // The draft was not cleared: closing and reopening the panel brings the edit back.
  rerender(<Host show={false} onSaved={onSaved} />);
  rerender(<Host show onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByDisplayValue("villain")).toBeInTheDocument());
});
