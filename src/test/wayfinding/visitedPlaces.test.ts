import { it, expect, beforeEach } from "vitest";
import {
  loadVisited,
  loadVisitedOrdered,
  markVisited,
  isVisited,
  _resetVisitedForTests,
} from "@/atlas/visited/visitedPlaces";

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

it("loadVisitedOrdered returns ids newest-first", async () => {
  // Inject entries with known timestamps directly via markVisited, then
  // override timestamps by writing raw localStorage so we can control order.
  const storage = window.localStorage;
  storage.setItem(
    "atlas-visited-v1",
    JSON.stringify({
      "older-id": { visitedAt: "2026-01-01T00:00:00.000Z" },
      "middle-id": { visitedAt: "2026-06-01T00:00:00.000Z" },
      "newest-id": { visitedAt: "2026-07-20T00:00:00.000Z" },
    }),
  );
  const ordered = loadVisitedOrdered();
  expect(ordered).toEqual(["newest-id", "middle-id", "older-id"]);
});

it("loadVisitedOrdered returns empty array when nothing visited", () => {
  expect(loadVisitedOrdered()).toEqual([]);
});
