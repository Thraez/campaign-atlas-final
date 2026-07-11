import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeekController } from "@/atlas/peek/usePeekController";

const rect = { top: 100, bottom: 120, left: 400, right: 460, width: 60, height: 20 } as DOMRect;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("opens after the delay and closes after the grace period", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.onTriggerEnter("saltmere", rect));
  expect(result.current.peek).toBeNull();
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.peek?.entityId).toBe("saltmere");
  act(() => result.current.onTriggerLeave());
  act(() => vi.advanceTimersByTime(80));
  expect(result.current.peek).toBeNull();
});

it("keeps the card open when the pointer moves onto it (bridge)", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(200); });
  act(() => { result.current.onTriggerLeave(); result.current.onCardEnter(); vi.advanceTimersByTime(80); });
  expect(result.current.peek?.entityId).toBe("a");
});

it("does nothing on coarse pointers", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: false }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(500); });
  expect(result.current.peek).toBeNull();
});

it("cancels a pending open if the pointer moves more than 5px", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => result.current.onTriggerEnter("a", rect, { x: 100, y: 100 }));
  act(() => result.current.onPointerMove({ x: 120, y: 100 }));
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.peek).toBeNull();
});

it("tapPeek shows immediately and a second tap on the same id signals open", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: false }));
  let opened = "";
  act(() => { opened = result.current.tapPeek("a", rect); });
  expect(result.current.peek?.entityId).toBe("a");
  expect(opened).toBe("");
  act(() => { opened = result.current.tapPeek("a", rect); });
  expect(opened).toBe("a");
});

it("re-hover while peek is already open switches entity immediately (no delay)", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => { result.current.onTriggerEnter("first", rect); vi.advanceTimersByTime(200); });
  expect(result.current.peek?.entityId).toBe("first");
  const rect2 = { ...rect, left: 200, right: 260 } as DOMRect;
  act(() => result.current.onTriggerEnter("second", rect2));
  expect(result.current.peek?.entityId).toBe("second");
});

it("onCardLeave schedules the close grace period", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(200); });
  expect(result.current.peek).not.toBeNull();
  act(() => result.current.onCardLeave());
  act(() => vi.advanceTimersByTime(80));
  expect(result.current.peek).toBeNull();
});

it("dismiss immediately closes the peek card", () => {
  const { result } = renderHook(() => usePeekController({ pointerFine: true }));
  act(() => { result.current.onTriggerEnter("a", rect); vi.advanceTimersByTime(200); });
  expect(result.current.peek).not.toBeNull();
  act(() => result.current.dismiss());
  expect(result.current.peek).toBeNull();
});
