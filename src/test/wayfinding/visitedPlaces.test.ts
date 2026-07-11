import { it, expect, beforeEach } from "vitest";
import { loadVisited, markVisited, isVisited, _resetVisitedForTests } from "@/atlas/visited/visitedPlaces";

beforeEach(() => _resetVisitedForTests());

it("starts empty, records visits, and persists them", () => {
  expect(loadVisited().size).toBe(0);
  expect(isVisited("saltmere")).toBe(false);
  markVisited("saltmere");
  expect(isVisited("saltmere")).toBe(true);
  expect(loadVisited().has("saltmere")).toBe(true);
});

it("ignores empty ids and de-duplicates", () => {
  markVisited("");
  markVisited("a");
  markVisited("a");
  expect(loadVisited().size).toBe(1);
});
