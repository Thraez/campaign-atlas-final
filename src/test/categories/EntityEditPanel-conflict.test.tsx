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
  const disk = { content: initial };
  const saves: Array<{ baseHash: string | null; content: string; status: number }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/__atlas/read")) {
      if (!u.includes(encodeURIComponent(PATH))) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ contents: disk.content }), { status: 200 });
    }
    if (u.startsWith("/__atlas/save")) {
      const body = JSON.parse(String(init!.body)) as {
        files: Array<{ path: string; content: string; baseHash: string | null }>;
      };
      const f = body.files[0];
      const currentHash = await hashContent(disk.content);
      if (f.baseHash !== currentHash) {
        saves.push({ baseHash: f.baseHash, content: f.content, status: 409 });
        return new Response(
          JSON.stringify({
            error: "Conflict",
            reason: "stale-base",
            failedPath: f.path,
            currentHash,
          }),
          { status: 409 },
        );
      }
      disk.content = f.content;
      saves.push({ baseHash: f.baseHash, content: f.content, status: 200 });
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

it("useEntityEditDraft.rebase keeps the edits, takes the new hash, and stays dirty", () => {
  const { result } = renderHook(() => useEntityEditDraft());
  const fields = { id: "corven", type: "npc", visibility: "dm" as const, summary: "" };
  act(() => result.current.load({ sourcePath: PATH, baseHash: "h1", fields, body: "v1\n" }));
  act(() => result.current.setBody("mine\n"));
  act(() => result.current.rebase("h2", { fields, body: "v2 from disk\n", secrets: [] }));
  expect(result.current.draft?.baseHash).toBe("h2");
  expect(result.current.draft?.body).toBe("mine\n");
  expect(result.current.isDirty()).toBe(true);
  // Typing the disk's content back makes it clean: pristine is now the new file.
  act(() => result.current.setBody("v2 from disk\n"));
  expect(result.current.isDirty()).toBe(false);
});
