import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EntityEditPanel } from "@/atlas/categories/EntityEditPanel";
import { vi } from "vitest";

describe("useEntityEditDraft", () => {
  it("is clean until loaded, dirty after a field edit, snapshot round-trips", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    expect(result.current.isDirty()).toBe(false);

    act(() =>
      result.current.load({
        sourcePath: "content/w/npcs/corven.md",
        baseHash: "sha256:abc",
        fields: { id: "corven", type: "npc", visibility: "dm", summary: "s" },
        body: "# Corven\n",
      }),
    );
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
    return new Response(
      JSON.stringify({ saved: 1, paths: body.files.map((f: { path: string }) => f.path) }),
      { status: 200 },
    );
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
    return new Response(
      JSON.stringify({ saved: 1, paths: body.files.map((f: { path: string }) => f.path) }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  const onSaved = vi.fn();
  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={onSaved} />,
  );
  await waitFor(() => expect(screen.getByLabelText(/body/i)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/body/i), { target: { value: "# Corven\n\nnew body\n" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

it("surfaces an inline error (not a perpetual Loading…) when the source file is missing", async () => {
  // B2: an orphaned entity whose .md is absent makes /__atlas/read 404. The
  // panel must show the error + a Close affordance, never hang on "Loading…".
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ error: "NotFound", path: "content/w/npcs/ghost.md" }), {
        status: 404,
      });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/ghost.md" onClose={() => {}} onSaved={() => {}} />,
  );

  await waitFor(() => expect(screen.getByText(/source file not found/i)).toBeInTheDocument());
  expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
});

it("formatting toolbar wraps the textarea selection and updates the body", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
  // Select the word "Corven" wherever it sits in the loaded body.
  const start = ta.value.indexOf("Corven");
  ta.focus();
  ta.setSelectionRange(start, start + "Corven".length);
  fireEvent.click(screen.getByRole("button", { name: "Bold" }));
  await waitFor(() =>
    expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toContain("**Corven**"),
  );
});

it("Ctrl+B wraps the selection in bold via the keyboard shortcut", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
  const start = ta.value.indexOf("Corven");
  ta.focus();
  ta.setSelectionRange(start, start + "Corven".length);
  fireEvent.keyDown(ta, { key: "b", ctrlKey: true });
  await waitFor(() =>
    expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toContain("**Corven**"),
  );
});

it("Ctrl+K wraps the selection as a wikilink via the keyboard shortcut", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
  const start = ta.value.indexOf("Corven");
  ta.focus();
  ta.setSelectionRange(start, start + "Corven".length);
  fireEvent.keyDown(ta, { key: "k", ctrlKey: true });
  await waitFor(() =>
    expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toContain("[[Corven]]"),
  );
});

it("Cmd+I (metaKey) applies italic via the keyboard shortcut", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
  const start = ta.value.indexOf("Corven");
  ta.focus();
  ta.setSelectionRange(start, start + "Corven".length);
  fireEvent.keyDown(ta, { key: "i", metaKey: true });
  await waitFor(() =>
    expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toContain("*Corven*"),
  );
});

it("Ctrl+B does not format while the wikilink autocomplete popover is open", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
  // Opens the entity-autocomplete popover (acCtx becomes non-null).
  fireEvent.change(ta, { target: { value: ta.value + "[[" } });
  const beforeValue = (screen.getByLabelText(/body/i) as HTMLTextAreaElement).value;
  fireEvent.keyDown(screen.getByLabelText(/body/i), { key: "b", ctrlKey: true });
  expect((screen.getByLabelText(/body/i) as HTMLTextAreaElement).value).toBe(beforeValue);
});

it("edit panel has no embedded preview or DM-notes toggle (superseded by global lens)", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/__atlas/read")) {
      return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
    }
    return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <EntityEditPanel sourcePath="content/w/npcs/corven.md" onClose={() => {}} onSaved={() => {}} />,
  );
  await waitFor(() => screen.getByDisplayValue(/old body/i));
  expect(screen.queryByText(/show dm notes/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /focus mode/i })).not.toBeInTheDocument();
});

describe("wikilink autocomplete ARIA wiring (N132)", () => {
  it("wires aria-controls/aria-activedescendant to the active popover option", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/__atlas/read")) {
        return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
      }
      if (String(url).includes("/__atlas/assets/images")) {
        return new Response(JSON.stringify({ images: ["banner.png", "map.png"] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EntityEditPanel
        sourcePath="content/w/npcs/corven.md"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await waitFor(() => screen.getByDisplayValue(/old body/i));
    const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: ta.value + "![[" } });
    const firstOption = await screen.findByRole("option", { name: /banner\.png/i });

    expect(screen.getByRole("listbox")).toHaveAttribute("id", "wikilink-popover-listbox");
    expect(firstOption).toHaveAttribute("id", "wikilink-option-0");
    expect(ta).toHaveAttribute("aria-controls", "wikilink-popover-listbox");
    expect(ta).toHaveAttribute("aria-activedescendant", "wikilink-option-0");

    fireEvent.keyDown(ta, { key: "ArrowDown" });
    await waitFor(() => expect(ta).toHaveAttribute("aria-activedescendant", "wikilink-option-1"));
    expect(screen.getByRole("option", { name: /map\.png/i })).toHaveAttribute(
      "id",
      "wikilink-option-1",
    );
  });

  it("keeps aria-controls but omits aria-activedescendant when the popover has no matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/__atlas/read")) {
        return new Response(JSON.stringify({ contents: RAW }), { status: 200 });
      }
      // No entities/images configured — the popover renders "No matches".
      return new Response(JSON.stringify({ saved: 1, paths: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EntityEditPanel
        sourcePath="content/w/npcs/corven.md"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await waitFor(() => screen.getByDisplayValue(/old body/i));
    const ta = screen.getByLabelText(/body/i) as HTMLTextAreaElement;

    fireEvent.change(ta, { target: { value: ta.value + "[[" } });
    await waitFor(() => expect(screen.getByText(/no matches/i)).toBeInTheDocument());

    expect(ta).toHaveAttribute("aria-controls", "wikilink-popover-listbox");
    expect(ta).not.toHaveAttribute("aria-activedescendant");
  });
});
