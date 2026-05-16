import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { EntityBodyPreview } from "@/atlas/categories/EntityBodyPreview";
import { vi } from "vitest";

describe("useEntityEditDraft", () => {
  it("is clean until loaded, dirty after a field edit, snapshot round-trips", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    expect(result.current.isDirty()).toBe(false);

    act(() => result.current.load({
      sourcePath: "content/w/npcs/corven.md",
      baseHash: "sha256:abc",
      fields: { id: "corven", type: "npc", visibility: "dm", summary: "s" },
      body: "# Corven\n",
    }));
    expect(result.current.isDirty()).toBe(false); // loaded == pristine

    act(() => result.current.setBody("# Corven edited\n"));
    expect(result.current.isDirty()).toBe(true);

    const snap = result.current.snapshot();
    const { result: r2 } = renderHook(() => useEntityEditDraft());
    act(() => r2.current.applySnapshot(snap));
    expect(r2.current.isDirty()).toBe(true);
    expect(r2.current.draft?.body).toBe("# Corven edited\n");

    act(() => r2.current.clear());
    expect(r2.current.isDirty()).toBe(false);
    expect(r2.current.draft).toBeNull();
  });
});

const RAW = `---\ntitle: Corven\natlas:\n  id: corven\n  type: npc\n  visibility: dm\n---\n\n# Corven\n\nold body\n`;

it("loads an entity, edits the body, builds a save change through the shared rewrite", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    // /__atlas/save
    const body = JSON.parse(String(init!.body));
    expect(body.files[0].path).toBe("content/w/npcs/corven.md");
    expect(body.files[0].content).toContain("new body");
    expect(body.files[0].content).toContain("atlas:");
    return new Response(JSON.stringify({ saved: 1, paths: body.files.map((f: {path:string}) => f.path) }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const onSaved = vi.fn();
  render(
    <EntityEditPanel
      sourcePath="content/w/npcs/corven.md"
      onClose={() => {}}
      onSaved={onSaved}
      draftApi={undefined as never}
    />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/));
  fireEvent.change(screen.getByLabelText(/body/i), { target: { value: "# Corven\n\nnew body\n" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

it("loads an entity, edits the body, saves via the shared rewrite", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    // /__atlas/save
    const body = JSON.parse(String(init!.body));
    expect(body.files[0].path).toBe("content/w/npcs/corven.md");
    expect(body.files[0].content).toContain("new body");
    expect(body.files[0].content).toContain("atlas:");
    return new Response(JSON.stringify({ saved: 1, paths: body.files.map((f: {path:string}) => f.path) }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const onSaved = vi.fn();
  render(
    <EntityEditPanel
      sourcePath="content/w/npcs/corven.md"
      onClose={() => {}}
      onSaved={onSaved}
    />,
  );
  await waitFor(() => expect(screen.getByLabelText(/body/i)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/body/i), { target: { value: "# Corven\n\nnew body\n" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

it("EntityBodyPreview renders markdown and toggles DM notes", () => {
  const body = "# H\n\n%%\nsecret\n%%\n\nvisible\n";
  const { rerender } = render(<EntityBodyPreview body={body} showDmNotes={false} />);
  expect(screen.getByText("visible")).toBeInTheDocument();
  expect(screen.queryByText("secret")).not.toBeInTheDocument();
  rerender(<EntityBodyPreview body={body} showDmNotes={true} />);
  expect(screen.getByText(/secret/)).toBeInTheDocument();
});
