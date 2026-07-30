import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";

const BASE_INIT = {
  sourcePath: "content/world/npcs/corven.md",
  baseHash: "sha256:abc",
  fields: { id: "corven", type: "npc", visibility: "dm", summary: "A rogue." },
  body: "# Corven\n",
} as const;

describe("useEntityEditDraft — setField", () => {
  it("marks draft dirty after a field change", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.load(BASE_INIT));
    expect(result.current.isDirty()).toBe(false);

    act(() => result.current.setField("type", "villain"));
    expect(result.current.isDirty()).toBe(true);
    expect(result.current.draft?.fields.type).toBe("villain");
  });

  it("updates only the targeted field; all other fields are unchanged", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.load(BASE_INIT));

    act(() => result.current.setField("visibility", "player"));
    expect(result.current.draft?.fields.visibility).toBe("player");
    expect(result.current.draft?.fields.type).toBe("npc");
    expect(result.current.draft?.fields.id).toBe("corven");
    expect(result.current.draft?.fields.summary).toBe("A rogue.");
  });

  it("is a no-op when no draft is loaded", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.setField("type", "villain"));
    expect(result.current.draft).toBeNull();
    expect(result.current.isDirty()).toBe(false);
  });
});

describe("useEntityEditDraft — setBody no-op on null draft", () => {
  it("is a no-op when no draft is loaded", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.setBody("something"));
    expect(result.current.draft).toBeNull();
    expect(result.current.isDirty()).toBe(false);
  });
});

describe("useEntityEditDraft — applySnapshot(null)", () => {
  it("clears the draft when a null snapshot is applied", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.load(BASE_INIT));
    expect(result.current.draft).not.toBeNull();

    act(() => result.current.applySnapshot(null));
    expect(result.current.draft).toBeNull();
    expect(result.current.isDirty()).toBe(false);
  });
});

describe("useEntityEditDraft — setSecrets (N99)", () => {
  it("load() with no secrets defaults to an empty pristine array", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.load(BASE_INIT));
    expect(result.current.draft?.secrets).toEqual([]);
    expect(result.current.isDirty()).toBe(false);
  });

  it("marks the draft dirty after editing an existing secret's field", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() =>
      result.current.load({
        ...BASE_INIT,
        secrets: [{ id: "sec1", for: "Aria", reveal: "Old reveal text" }],
      }),
    );
    expect(result.current.isDirty()).toBe(false);

    act(() =>
      result.current.setSecrets((prev) =>
        prev.map((s) => (s.id === "sec1" ? { ...s, reveal: "New reveal text" } : s)),
      ),
    );
    expect(result.current.isDirty()).toBe(true);
    expect(result.current.draft?.secrets[0].reveal).toBe("New reveal text");
  });

  it("accepts a direct array (non-updater) value", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.load(BASE_INIT));
    act(() => result.current.setSecrets([{ id: "sec1", reveal: "r" }]));
    expect(result.current.draft?.secrets).toEqual([{ id: "sec1", reveal: "r" }]);
    expect(result.current.isDirty()).toBe(true);
  });

  it("is a no-op when no draft is loaded", () => {
    const { result } = renderHook(() => useEntityEditDraft());
    act(() => result.current.setSecrets([{ id: "sec1", reveal: "r" }]));
    expect(result.current.draft).toBeNull();
    expect(result.current.isDirty()).toBe(false);
  });
});
