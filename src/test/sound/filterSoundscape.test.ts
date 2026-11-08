/**
 * The player soundscape filter, with each area decided as the build decides
 * it (R-11b): the v1 adapter presents the map, the per-campaign resolver
 * (ADR-0004) gives the verdict, `filterSoundscapeForPlayer` keeps what ships.
 */
import { describe, it, expect } from "vitest";
import { filterSoundscapeForPlayer } from "../../../scripts/atlas/filterSoundscape";
import { playerResolution } from "../../../scripts/atlas/playerResolution";
import type { FogOverlay, Region, SoundArea, SoundscapeConfig } from "@/atlas/content/schema";
import { resolveCampaign } from "@/atlas/content/resolveCampaign";
import { V1_CAMPAIGN_ID, v1Model } from "@/atlas/content/v1Model";

/** A sound-only area's own polygon (the adapter skips one with fewer than 3 points). */
const PTS: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Filter `sc` on map "m" as a player build does. */
function playerSound(
  sc: SoundscapeConfig,
  regions: Region[] = [],
  fogs: FogOverlay[] = [],
): SoundscapeConfig | undefined {
  const { model } = v1Model({
    worldId: "w",
    maps: [
      { id: "m", worldId: "w", name: "M", width: 1000, height: 1000, layers: [], soundscape: sc },
    ],
    regions,
    fogs,
  });
  const res = playerResolution(model, resolveCampaign(model, [], V1_CAMPAIGN_ID));
  return filterSoundscapeForPlayer(sc, (a) => res.soundShips("m", a.id));
}

function makeArea(id: string, visibility?: string, name?: string) {
  return {
    id,
    points: PTS,
    bed: { src: `audio/${id}.ogg` },
    ...(visibility ? { visibility: visibility as SoundArea["visibility"] } : {}),
    ...(name ? { name } : {}),
  };
}

function makeRegion(id: string, visibility: Region["visibility"]): Region {
  return {
    id,
    mapId: "m",
    name: id,
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    visibility,
  };
}

describe("filterSoundscapeForPlayer", () => {
  it("drops dm-visibility areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("tavern", "player"), makeArea("dungeon", "dm")],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(1);
    expect(result?.areas![0].id).toBe("area-0");
  });

  it("drops hidden-visibility areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("forest", "player"), makeArea("secret", "hidden")],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(1);
  });

  it("keeps player and rumor areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("city", "player"), makeArea("rumored", "rumor")],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(2);
  });

  it("drops sound-only areas with no visibility set (missing is dm, ADR-0001 addendum)", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("ambient"), makeArea("tavern", "player")],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(1);
    expect(result?.areas?.[0].bed.src).toBe("audio/tavern.ogg");
  });

  it("drops areas whose visibility is present but empty or not a string (ADR-0001 addendum)", () => {
    const area = (id: string, visibility: unknown) =>
      ({ id, points: PTS, bed: { src: `audio/${id}.ogg` }, visibility }) as unknown as SoundArea;
    const sc: SoundscapeConfig = {
      areas: [area("null", null), area("empty", ""), area("false", false), area("typo", "secret")],
    };
    expect(playerSound(sc)?.areas).toEqual([]);
  });

  it("neutralises area IDs to positional indices", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("secret-cave", "player"), makeArea("town-square", "player")],
    };
    const result = playerSound(sc);
    expect(result?.areas![0].id).toBe("area-0");
    expect(result?.areas![1].id).toBe("area-1");
  });

  it("strips name field from areas", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("tavern", "player", "Ye Olde Tavern (DM label)")],
    };
    const result = playerSound(sc);
    expect(result?.areas![0].name).toBeUndefined();
  });

  it("preserves bed src, gain, and other safe fields", () => {
    const sc: SoundscapeConfig = {
      areas: [
        {
          id: "x",
          points: PTS,
          bed: { src: "audio/x.ogg", gain: 0.5, srcFallback: "audio/x.mp3" },
          visibility: "player",
        },
      ],
    };
    const result = playerSound(sc);
    expect(result?.areas![0].bed.src).toBe("audio/x.ogg");
    expect(result?.areas![0].bed.gain).toBe(0.5);
    expect(result?.areas![0].bed.srcFallback).toBe("audio/x.mp3");
  });

  it("preserves masterGain and enabled flag", () => {
    const sc: SoundscapeConfig = { enabled: true, masterGain: 0.6, areas: [] };
    const result = playerSound(sc);
    expect(result?.enabled).toBe(true);
    expect(result?.masterGain).toBe(0.6);
  });

  it("returns undefined when input is undefined", () => {
    expect(filterSoundscapeForPlayer(undefined, () => true)).toBeUndefined();
  });

  it("returns empty areas when all areas were DM-only", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("dm-area", "dm"), makeArea("hidden-area", "hidden")],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(0);
  });

  it("preserves masterGain: 0 (falsy number is a valid mute volume, not 'unset')", () => {
    const sc: SoundscapeConfig = { masterGain: 0, areas: [] };
    const result = playerSound(sc);
    expect(result?.masterGain).toBe(0);
  });

  it("preserves enabled: false (explicitly-disabled soundscape passes through)", () => {
    const sc: SoundscapeConfig = { enabled: false, masterGain: 0.8, areas: [] };
    const result = playerSound(sc);
    expect(result?.enabled).toBe(false);
    expect(result?.masterGain).toBe(0.8);
  });

  it("handles missing areas field (undefined areas treated as empty)", () => {
    const sc = { masterGain: 0.5 } as unknown as SoundscapeConfig;
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(0);
  });

  it("preserves regionId through the ...rest spread (ride-on link must survive neutralisation)", () => {
    const sc: SoundscapeConfig = {
      areas: [
        {
          id: "forest-bed",
          regionId: "region-forest",
          bed: { src: "audio/forest.ogg" },
        },
      ],
    };
    const result = playerSound(sc, [makeRegion("region-forest", "player")]);
    expect(result?.areas![0].regionId).toBe("region-forest");
  });

  it("drops an area with no file chosen yet (blank bed.src)", () => {
    const sc: SoundscapeConfig = {
      areas: [
        { id: "unconfigured", points: PTS, bed: { src: "" }, visibility: "player" },
        makeArea("tavern", "player"),
      ],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(1);
    expect(result?.areas![0].id).toBe("area-0");
  });

  it("drops an area whose bed.src is whitespace-only", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "unconfigured", points: PTS, bed: { src: "   " }, visibility: "player" }],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(0);
  });

  it("preserves own points through the ...rest spread (sound-only polygon shape must survive)", () => {
    const pts: [number, number][] = [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ];
    const sc: SoundscapeConfig = {
      areas: [
        { id: "cave-zone", points: pts, bed: { src: "audio/cave.ogg" }, visibility: "player" },
      ],
    };
    const result = playerSound(sc);
    expect(result?.areas![0].points).toEqual(pts);
  });

  it("drops a ride-on area whose region is dm-only", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "secret-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc, [makeRegion("secret-region", "dm")]);
    expect(result?.areas).toHaveLength(0);
  });

  it("drops a ride-on area whose region is hidden", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "secret-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc, [makeRegion("secret-region", "hidden")]);
    expect(result?.areas).toHaveLength(0);
  });

  it("keeps a ride-on area whose region is player-visible", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "public-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc, [makeRegion("public-region", "player")]);
    expect(result?.areas).toHaveLength(1);
    expect(result?.areas![0].regionId).toBe("public-region");
  });

  it("keeps a ride-on area whose region is rumor-visible", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "rumor-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc, [makeRegion("rumor-region", "rumor")]);
    expect(result?.areas).toHaveLength(1);
  });

  it("drops a ride-on area whose regionId no longer resolves to any region", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "deleted-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc, [makeRegion("other-region", "player")]);
    expect(result?.areas).toHaveLength(0);
  });

  it("ignores an area's own visibility field when it also has a regionId (region wins)", () => {
    const sc: SoundscapeConfig = {
      areas: [
        {
          id: "ride",
          regionId: "secret-region",
          visibility: "player",
          bed: { src: "audio/ride.ogg" },
        },
      ],
    };
    const result = playerSound(sc, [makeRegion("secret-region", "dm")]);
    expect(result?.areas).toHaveLength(0);
  });

  it("still applies own-visibility filtering for sound-only areas when regions are passed", () => {
    const sc: SoundscapeConfig = {
      areas: [makeArea("tavern", "player"), makeArea("dungeon", "dm")],
    };
    const result = playerSound(sc, [makeRegion("unrelated-region", "player")]);
    expect(result?.areas).toHaveLength(1);
  });

  it("drops a ride-on area with no regions array passed at all (defensive default)", () => {
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "some-region", bed: { src: "audio/ride.ogg" } }],
    };
    const result = playerSound(sc);
    expect(result?.areas).toHaveLength(0);
  });

  it("drops a sound-only area with any point under fog (arch-02)", () => {
    const fog: FogOverlay = {
      mapId: "m",
      enabled: true,
      reveals: [
        [
          [0, 0],
          [5, 0],
          [5, 20],
          [0, 20],
        ],
      ],
    };
    const lit: SoundArea = {
      id: "lit",
      visibility: "player",
      points: [
        [1, 1],
        [4, 1],
        [4, 4],
      ],
      bed: { src: "audio/lit.ogg" },
    };
    const sc: SoundscapeConfig = { areas: [lit, makeArea("half-fogged", "player")] };
    const result = playerSound(sc, [], [fog]);
    expect(result?.areas?.map((a) => a.bed.src)).toEqual(["audio/lit.ogg"]);
  });

  it("drops a ride-on area whose region is under fog", () => {
    const fog: FogOverlay = { mapId: "m", enabled: true, reveals: [] };
    const sc: SoundscapeConfig = {
      areas: [{ id: "ride", regionId: "public-region", bed: { src: "audio/ride.ogg" } }],
    };
    expect(playerSound(sc, [makeRegion("public-region", "player")], [fog])?.areas).toHaveLength(0);
  });

  it("drops what the predicate refuses, whatever its visibility", () => {
    const sc: SoundscapeConfig = { areas: [makeArea("tavern", "player")] };
    expect(filterSoundscapeForPlayer(sc, () => false)?.areas).toEqual([]);
  });
});
