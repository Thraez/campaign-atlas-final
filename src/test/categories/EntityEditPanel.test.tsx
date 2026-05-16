import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityEditDraft } from "@/atlas/categories/useEntityEditDraft";

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
