import { it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisitedPlaces } from "@/atlas/visited/useVisitedPlaces";
import { _resetVisitedForTests } from "@/atlas/visited/visitedPlaces";

beforeEach(() => _resetVisitedForTests());

it("exposes a reactive visited set and a mark() that grows it", () => {
  const { result } = renderHook(() => useVisitedPlaces());
  expect(result.current.visited.size).toBe(0);
  act(() => result.current.mark("saltmere"));
  expect(result.current.visited.has("saltmere")).toBe(true);
});
