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
