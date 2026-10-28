import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  renderHook,
  act,
} from "@testing-library/react";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { hashContent } from "@/atlas/save/localFsSave";

/**
 * Ticket eval-2026-10/17: a 409 on Save must say the file changed on disk and
 * offer a rebase that re-reads it, keeps the DM's draft and lets Save succeed.
 *
 * The fetch stub is a tiny fake of the dev save endpoint: it keeps one file on
 * "disk" and refuses a write whose baseHash doesn't match the disk's hash, the
 * way `/__atlas/save` does.
 */
const PATH = "content/w/npcs/corven.md";
const V1 = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\n\n# Corven\n\nold body\n`;
// Someone else (Obsidian, a sync) touched the file: a new top-level key and a new atlas tag.
const V2 = `---\ntitle: Corven\nsource: obsidian\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n  tags:\n    - harbour\n---\n\n# Corven\n\nold body, edited in Obsidian\n`;

function fakeDisk(initial: string) {
  // content null = the file was deleted (or moved) on disk.
  const disk: { content: string | null } = { content: initial };
  const saves: Array<{ baseHash: string | null; content: string; status: number }> = [];
  const conflict = (reason: string, failedPath: string, currentHash?: string) =>
    new Response(JSON.stringify({ error: "Conflict", reason, failedPath, currentHash }), {
      status: 409,
    });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/__atlas/read")) {
      if (!u.includes(encodeURIComponent(PATH)) || disk.content === null) {
        return new Response("{}", { status: 404 });
      }
      return new Response(JSON.stringify({ contents: disk.content }), { status: 200 });
    }
    if (u.startsWith("/__atlas/save")) {
      const body = JSON.parse(String(init!.body)) as {
        files: Array<{ path: string; content: string; baseHash: string | null }>;
      };
      const f = body.files[0];
      const record = (status: number) =>
        saves.push({ baseHash: f.baseHash, content: f.content, status });
      // Same rules as /__atlas/save: null baseHash = create-only.
      if (disk.content === null) {
        if (f.baseHash !== null) {
          record(409);
          return conflict("missing-base", f.path);
        }
      } else {
        const currentHash = await hashContent(disk.content);
        if (f.baseHash === null) {
          record(409);
          return conflict("already-exists", f.path, currentHash);
        }
        if (f.baseHash !== currentHash) {
          record(409);
          return conflict("stale-base", f.path, currentHash);
        }
      }
      disk.content = f.content;
      record(200);
      return new Response(JSON.stringify({ saved: 1, paths: [f.path] }), { status: 200 });
    }
    return new Response(JSON.stringify({ images: [] }), { status: 200 });
  });
  return { disk, saves, fetchMock };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("a 409 says the file changed on disk, not that it may be missing", async () => {
  const { disk, fetchMock } = fakeDisk(V1);
  vi.stubGlobal("fetch", fetchMock);

  render(<EntityEditPanel sourcePath={PATH} onClose={() => {}} onSaved={() => {}} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^body$/i), {
    target: { value: "# Corven\n\nmy new body\n" },
  });
  disk.content = V2;
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => expect(screen.getByText(/changed on disk/i)).toBeInTheDocument());
  expect(screen.queryByText(/may be missing/i)).not.toBeInTheDocument();
  // The DM's edits are still on screen, not replaced by an error page.
  expect(screen.getByDisplayValue(/my new body/)).toBeInTheDocument();
});

it("409 -> rebase -> save succeeds and keeps every draft edit on top of the new file", async () => {
  const { disk, saves, fetchMock } = fakeDisk(V1);
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  render(<EntityEditPanel sourcePath={PATH} onClose={() => {}} onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));

  // Draft edits: a field, the body and a secret.
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });
  fireEvent.change(screen.getByLabelText(/^body$/i), {
    target: { value: "# Corven\n\nmy new body\n" },
  });
  fireEvent.click(screen.getByRole("button", { name: /add puzzle secret/i }));
  fireEvent.change(await screen.findByPlaceholderText(/reveal the player sees/i), {
    target: { value: "He is the harbourmaster's brother." },
  });

  disk.content = V2;
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(screen.getByText(/changed on disk/i)).toBeInTheDocument());
  expect(saves.at(-1)?.status).toBe(409);

  fireEvent.click(screen.getByRole("button", { name: /reload from disk/i }));
  await waitFor(() => expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument());

  // Both sides changed the body: the DM's wins, and the panel says so.
  expect(screen.getByText(/overwrite/i)).toBeInTheDocument();
  // Nothing typed was lost by the rebase.
  expect(screen.getByDisplayValue("villain")).toBeInTheDocument();
  expect(screen.getByDisplayValue(/my new body/)).toBeInTheDocument();
  expect(screen.getByDisplayValue("He is the harbourmaster's brother.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());

  const ok = saves.at(-1)!;
  expect(ok.status).toBe(200);
  expect(ok.baseHash).toBe(await hashContent(V2));
  // Draft edits win for what the panel edits...
  expect(ok.content).toContain("type: villain");
  expect(ok.content).toContain("my new body");
  expect(ok.content).toContain("He is the harbourmaster's brother.");
  // ...and the frontmatter the panel doesn't edit comes from the new file (rawRef refreshed).
  expect(ok.content).toContain("source: obsidian");
  expect(ok.content).toContain("harbour");
});

// Obsidian edited the summary and visibility; the DM's draft never touched them.
const V2_FIELDS = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: player\n  summary: Harbour fixer\n---\n\n# Corven\n\nold body\n`;

it("rebase takes disk values for fields the DM didn't touch", async () => {
  const { disk, saves, fetchMock } = fakeDisk(V1);
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  render(<EntityEditPanel sourcePath={PATH} onClose={() => {}} onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });

  disk.content = V2_FIELDS;
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => screen.getByText(/changed on disk/i));
  fireEvent.click(screen.getByRole("button", { name: /reload from disk/i }));
  await waitFor(() => expect(screen.getByDisplayValue("Harbour fixer")).toBeInTheDocument());
  expect((screen.getByLabelText(/^visibility$/i) as HTMLSelectElement).value).toBe("player");
  expect(screen.getByDisplayValue("villain")).toBeInTheDocument();
  // Neither side changed the body, so nothing outside is being overwritten.
  expect(screen.queryByText(/overwrite/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const ok = saves.at(-1)!;
  expect(ok.content).toContain("type: villain");
  expect(ok.content).toContain("visibility: player");
  expect(ok.content).toContain("summary: Harbour fixer");
});

it("a file deleted on disk says so and offers Save as a new file", async () => {
  const { disk, saves, fetchMock } = fakeDisk(V1);
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  render(<EntityEditPanel sourcePath={PATH} onClose={() => {}} onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^body$/i), {
    target: { value: "# Corven\n\nmy new body\n" },
  });

  disk.content = null;
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(screen.getByText(/deleted or moved/i)).toBeInTheDocument());
  expect(screen.queryByText(/changed on disk/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /reload from disk/i })).not.toBeInTheDocument();
  expect(screen.getByDisplayValue(/my new body/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /save as a new file/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const ok = saves.at(-1)!;
  expect(ok.status).toBe(200);
  expect(ok.baseHash).toBeNull();
  expect(ok.content).toContain("my new body");
});

/** Owns the draft like AtlasPlacementEditor does, so it outlives the panel. */
function ReopenHost({ show, onSaved }: { show: boolean; onSaved: () => void }) {
  const api = useEntityEditDraft();
  return show ? (
    <EntityEditPanel sourcePath={PATH} draftApi={api} onClose={() => {}} onSaved={onSaved} />
  ) : null;
}

it("reopening a kept draft after the file changed rebases it, so the first Save succeeds", async () => {
  const { disk, saves, fetchMock } = fakeDisk(V1);
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();

  const { rerender } = render(<ReopenHost show onSaved={onSaved} />);
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "villain" } });

  rerender(<ReopenHost show={false} onSaved={onSaved} />);
  disk.content = V2_FIELDS;
  rerender(<ReopenHost show onSaved={onSaved} />);

  await waitFor(() => expect(screen.getByDisplayValue("Harbour fixer")).toBeInTheDocument());
  expect(screen.getByDisplayValue("villain")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saves.map((s) => s.status)).toEqual([200]);
  expect(saves[0].baseHash).toBe(await hashContent(V2_FIELDS));
  expect(saves[0].content).toContain("summary: Harbour fixer");
});

it("useEntityEditDraft.rebase keeps the edits, takes the new hash, and stays dirty", () => {
  const { result } = renderHook(() => useEntityEditDraft());
  const fields = { id: "corven", type: "npc", visibility: "dm" as const, summary: "" };
  act(() => result.current.load({ sourcePath: PATH, baseHash: "h1", fields, body: "v1\n" }));
  act(() => result.current.setBody("mine\n"));
  const disk = { fields: { ...fields, summary: "from disk" }, body: "v2\n", secrets: [] };
  let outcome: ReturnType<typeof result.current.rebase> = null;
  act(() => {
    outcome = result.current.rebase(PATH, "h2", disk);
  });
  expect(outcome).toEqual({ bodyOverwritten: true });
  expect(result.current.draft?.baseHash).toBe("h2");
  expect(result.current.draft?.body).toBe("mine\n");
  expect(result.current.draft?.fields.summary).toBe("from disk");
  expect(result.current.isDirty()).toBe(true);
  // Typing the disk's body back makes it clean: pristine is now the new file.
  act(() => result.current.setBody("v2\n"));
  expect(result.current.isDirty()).toBe(false);
  // A rebase for another entity is ignored.
  act(() => {
    outcome = result.current.rebase("content/w/npcs/other.md", "h3", disk);
  });
  expect(outcome).toBeNull();
  expect(result.current.draft?.baseHash).toBe("h2");
});
