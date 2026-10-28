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

type SaveReply = () => Response;

const writeFailedReply: SaveReply = () =>
  new Response(
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

function fakeServer(reply: SaveReply = writeFailedReply) {
  const saves: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: V1 }), { status: 200 });
    }
    if (u.startsWith("/__atlas/save")) {
      saves.push(String(init!.body));
      return reply();
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

it("a rolled-back write keeps the form and the edit, never calls onSaved, and names the failed file", async () => {
  const { saves, fetchMock } = fakeServer();
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  const { rerender } = render(<Host show onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(saves).toHaveLength(1));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/EACCES/);
  expect(alert).toHaveTextContent(new RegExp(`Could not write ${PATH}`));
  expect(alert).toHaveTextContent("Nothing was saved; your edits are still here.");
  // Still the edit form, with the DM's value, and not the load-error page.
  expect(screen.getByLabelText(/^type$/i)).toHaveValue("villain");
  expect(screen.queryByText(/source file may be missing/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Saved\.$/)).not.toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();

  // The draft was not cleared: closing and reopening the panel brings the edit back.
  rerender(<Host show={false} onSaved={onSaved} />);
  rerender(<Host show onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByDisplayValue("villain")).toBeInTheDocument());
});

it("a refused save (plain LocalSaveError) also keeps the form, and Save retries", async () => {
  let fail = true;
  const { saves, fetchMock } = fakeServer(() =>
    fail
      ? new Response(JSON.stringify({ error: "Internal" }), { status: 500 })
      : new Response(JSON.stringify({ saved: 1, paths: [PATH] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  render(<Host show onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Internal");
  expect(alert).toHaveTextContent("Nothing was saved; your edits are still here.");
  expect(screen.getByLabelText(/^type$/i)).toHaveValue("villain");
  expect(screen.queryByText(/source file may be missing/i)).not.toBeInTheDocument();

  fail = false;
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(saves).toHaveLength(2));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("files written but the rebuild failed: says so with the build message, still clears the draft and calls onSaved", async () => {
  const { fetchMock } = fakeServer(
    () =>
      new Response(
        JSON.stringify({
          saved: 1,
          paths: [PATH],
          rebuilt: false,
          rebuildError: "boom: bad frontmatter in x.md",
          build: { ok: false, durationMs: 5, stderr: "boom: bad frontmatter in x.md" },
        }),
        { status: 207 },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  const { rerender } = render(<Host show onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/Saved, but the atlas rebuild failed:/)).toBeInTheDocument();
  expect(screen.getByText(/boom: bad frontmatter in x\.md/)).toBeInTheDocument();
  expect(screen.queryByText(/^Saved\.$/)).not.toBeInTheDocument();

  // The draft was cleared (the files are on disk): reopening shows the file, not the edit.
  rerender(<Host show={false} onSaved={onSaved} />);
  rerender(<Host show onSaved={onSaved} />);
  await waitFor(() => expect(screen.getByLabelText(/^type$/i)).toHaveValue("npc"));
});
