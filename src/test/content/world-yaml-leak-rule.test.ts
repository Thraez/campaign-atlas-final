/**
 * eval-46: one rule for "a player-visible region or route leaks the entity it
 * names". The build already applied it; Publish Check and the region/route
 * drafts only checked `player` against `dm`/`hidden`, so a `rumor` region on a
 * DM entity passed the check and failed the publish.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { linkLeaksToPlayers } from "@/atlas/content/visibility";
import { validateProject } from "@/atlas/yaml/validateProject";
import { useRegionDraft } from "@/atlas/regions/useRegionDraft";
import { useRouteDraft } from "@/atlas/routes/useRouteDraft";
import type { EntityVisibility } from "@/atlas/content/schema";
import { makeEntity, makeMap, makePlacement, makeProject } from "@/test/helpers/makeProject";

const square: [number, number][] = [
  [10, 10],
  [100, 10],
  [100, 100],
  [10, 100],
];

describe("linkLeaksToPlayers", () => {
  const cases: [EntityVisibility, EntityVisibility | undefined, boolean][] = [
    ["player", "player", false],
    ["player", "rumor", false],
    ["player", "dm", true],
    ["player", "hidden", true],
    ["player", undefined, true],
    ["rumor", "player", false],
    ["rumor", "dm", true],
    ["rumor", "hidden", true],
    ["rumor", undefined, true],
    ["dm", "dm", false],
    ["dm", undefined, false],
    ["hidden", "dm", false],
  ];
  it.each(cases)("%s item -> %s entity leaks: %s", (item, target, leaks) => {
    expect(linkLeaksToPlayers(item, target)).toBe(leaks);
  });
});

describe("Publish Check uses the build's rule", () => {
  const entities = [
    makeEntity({ id: "town", visibility: "player" }),
    makeEntity({ id: "lair", visibility: "dm" }),
  ];

  it("blocks a rumor region linked to a DM entity", () => {
    const map = makeMap({
      regions: [
        {
          id: "r1",
          mapId: "overview",
          name: "Whispers",
          visibility: "rumor",
          entityId: "lair",
          points: square,
        },
      ],
    });
    const { issues } = validateProject({
      project: makeProject({ maps: [map], entities }),
      draftPlacements: [],
    });
    const leak = issues.find((i) => i.code === "spoiler-leak-region");
    expect(leak?.severity).toBe("blocking");
  });

  it("blocks a player route through an unknown entity", () => {
    const map = makeMap({
      routes: [
        {
          id: "road",
          mapId: "overview",
          name: "Road",
          visibility: "player",
          waypoints: [{ entityId: "town" }, { entityId: "ghost" }],
        },
      ],
    });
    const { issues } = validateProject({
      project: makeProject({
        maps: [map],
        entities,
        placements: [makePlacement({ entityId: "town" })],
      }),
      draftPlacements: [],
    });
    const leak = issues.find((i) => i.code === "spoiler-leak-route");
    expect(leak?.severity).toBe("blocking");
  });
});

describe("region and route drafts use the build's rule", () => {
  const entityVisibility = new Map<string, EntityVisibility>([
    ["town", "player"],
    ["lair", "dm"],
  ]);
  const entityIds = new Set(entityVisibility.keys());

  it("the region draft flags a rumor region linked to a DM entity", () => {
    const map = makeMap({
      regions: [
        {
          id: "r1",
          mapId: "overview",
          name: "Whispers",
          visibility: "rumor",
          points: square,
        },
      ],
    });
    const { result } = renderHook(() => useRegionDraft(map, { entityIds, entityVisibility }));
    act(() => result.current.patch("r1", { entityId: "lair" }));
    const leak = result.current.issues.find((i) => i.code === "spoiler-leak");
    expect(leak?.severity).toBe("blocking");
  });

  it("the route draft flags a rumor route through a DM entity", () => {
    const map = makeMap({
      routes: [
        {
          id: "road",
          mapId: "overview",
          name: "Road",
          visibility: "rumor",
          waypoints: [{ entityId: "town" }, { entityId: "lair" }],
        },
      ],
    });
    const project = makeProject({
      maps: [map],
      placements: [
        makePlacement({ entityId: "town" }),
        makePlacement({ id: "p2", entityId: "lair" }),
      ],
    });
    const { result } = renderHook(() =>
      useRouteDraft(project, map, { entityIds, entityVisibility }),
    );
    const leak = result.current.issues.find((i) => i.code === "spoiler-leak");
    expect(leak?.severity).toBe("blocking");
  });
});
