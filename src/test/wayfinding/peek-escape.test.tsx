import { it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeekController } from "@/atlas/peek/usePeekController";

it("dismiss clears an open peek", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.show("a", { top: 10, bottom: 20, left: 10, right: 40, width: 30, height: 10 } as DOMRect));
  expect(result.current.peek).not.toBeNull();
  act(() => result.current.dismiss());
  expect(result.current.peek).toBeNull();
});
