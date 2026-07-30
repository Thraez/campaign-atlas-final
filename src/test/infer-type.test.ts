import { describe, it, expect } from "vitest";
import { inferTypeFromPath, isIgnoredPath } from "@/atlas/import/inferType";

// ---------------------------------------------------------------------------
// inferTypeFromPath
// ---------------------------------------------------------------------------

describe("inferTypeFromPath", () => {
  it("infers 'npc' from an npcs parent folder", () => {
    expect(inferTypeFromPath("npcs/goblin-chief.md")).toBe("npc");
  });

  it("infers 'npc' from the singular 'npc' folder", () => {
    expect(inferTypeFromPath("npc/thalindra.md")).toBe("npc");
  });

  it("infers 'npc' from a 'characters' folder", () => {
    expect(inferTypeFromPath("characters/elara.md")).toBe("npc");
  });

  it("infers 'settlement' from a plural 'settlements' folder", () => {
    expect(inferTypeFromPath("settlements/ironhold.md")).toBe("settlement");
  });

  it("infers 'settlement' from the singular 'settlement' folder", () => {
    expect(inferTypeFromPath("settlement/ironhold.md")).toBe("settlement");
  });

  it("infers 'map_note' from a 'maps' folder", () => {
    expect(inferTypeFromPath("maps/world-map.md")).toBe("map_note");
  });

  it("infers 'event' from an 'events' folder", () => {
    expect(inferTypeFromPath("events/the-sundering.md")).toBe("event");
  });

  it("returns 'note' for an unrecognized folder", () => {
    expect(inferTypeFromPath("lore/ancient-history.md")).toBe("note");
  });

  it("returns 'note' when there is no parent folder", () => {
    expect(inferTypeFromPath("standalone-note.md")).toBe("note");
  });

  it("is case-insensitive for folder matching", () => {
    expect(inferTypeFromPath("NPCs/goblin.md")).toBe("npc");
    expect(inferTypeFromPath("Settlements/ironhold.md")).toBe("settlement");
  });

  it("handles backslash-separated paths (Windows)", () => {
    expect(inferTypeFromPath("npcs\\goblin.md")).toBe("npc");
  });

  it("prefers the closest (immediate parent) folder over a distant ancestor", () => {
    // "settlements" is the immediate parent — wins over "npcs" higher up
    expect(inferTypeFromPath("npcs/settlements/ironhold.md")).toBe("settlement");
  });

  it("falls through to a more distant ancestor when the immediate parent is unknown", () => {
    // "extras" is unknown; "factions" is further up → wins
    expect(inferTypeFromPath("factions/extras/the-merchants-guild.md")).toBe("faction");
  });

  it("infers 'city' from plural and singular folders", () => {
    expect(inferTypeFromPath("cities/waterdeep.md")).toBe("city");
    expect(inferTypeFromPath("city/waterdeep.md")).toBe("city");
  });

  it("infers 'town' from plural and singular folders", () => {
    expect(inferTypeFromPath("towns/greenrest.md")).toBe("town");
    expect(inferTypeFromPath("town/greenrest.md")).toBe("town");
  });

  it("infers 'village' from plural and singular folders", () => {
    expect(inferTypeFromPath("villages/oakhurst.md")).toBe("village");
    expect(inferTypeFromPath("village/oakhurst.md")).toBe("village");
  });

  it("infers 'temple' from plural and singular folders", () => {
    expect(inferTypeFromPath("temples/shrine-of-light.md")).toBe("temple");
    expect(inferTypeFromPath("temple/shrine-of-light.md")).toBe("temple");
  });

  it("infers 'shop' from plural and singular folders", () => {
    expect(inferTypeFromPath("shops/the-rusty-blade.md")).toBe("shop");
    expect(inferTypeFromPath("shop/the-rusty-blade.md")).toBe("shop");
  });

  it("infers 'cave' from plural and singular folders", () => {
    expect(inferTypeFromPath("caves/whispering-hollow.md")).toBe("cave");
    expect(inferTypeFromPath("cave/whispering-hollow.md")).toBe("cave");
  });

  it("infers 'port' from plural and singular folders", () => {
    expect(inferTypeFromPath("ports/saltmarsh.md")).toBe("port");
    expect(inferTypeFromPath("port/saltmarsh.md")).toBe("port");
  });

  it("infers 'person' from 'people', 'persons', and singular folders", () => {
    expect(inferTypeFromPath("people/thalindra.md")).toBe("person");
    expect(inferTypeFromPath("persons/thalindra.md")).toBe("person");
    expect(inferTypeFromPath("person/thalindra.md")).toBe("person");
  });

  it("infers 'location' from 'places'/'place' and 'landmarks'/'landmark' folders", () => {
    expect(inferTypeFromPath("places/the-sunken-pier.md")).toBe("location");
    expect(inferTypeFromPath("place/the-sunken-pier.md")).toBe("location");
    expect(inferTypeFromPath("landmarks/the-sunken-pier.md")).toBe("location");
    expect(inferTypeFromPath("landmark/the-sunken-pier.md")).toBe("location");
  });

  it("infers 'capital' from plural and singular folders", () => {
    expect(inferTypeFromPath("capitals/ironhold.md")).toBe("capital");
    expect(inferTypeFromPath("capital/ironhold.md")).toBe("capital");
  });

  it("infers 'faction' from 'guilds'/'organizations' (and British spelling) folders", () => {
    expect(inferTypeFromPath("guilds/the-merchants-guild.md")).toBe("faction");
    expect(inferTypeFromPath("guild/the-merchants-guild.md")).toBe("faction");
    expect(inferTypeFromPath("organizations/the-merchants-guild.md")).toBe("faction");
    expect(inferTypeFromPath("organization/the-merchants-guild.md")).toBe("faction");
    expect(inferTypeFromPath("organisations/the-merchants-guild.md")).toBe("faction");
    expect(inferTypeFromPath("organisation/the-merchants-guild.md")).toBe("faction");
  });

  it("infers 'deity' from 'deities'/'gods' and singular folders", () => {
    expect(inferTypeFromPath("deities/the-allmother.md")).toBe("deity");
    expect(inferTypeFromPath("deity/the-allmother.md")).toBe("deity");
    expect(inferTypeFromPath("gods/the-allmother.md")).toBe("deity");
    expect(inferTypeFromPath("god/the-allmother.md")).toBe("deity");
  });
});

// ---------------------------------------------------------------------------
// isIgnoredPath
// ---------------------------------------------------------------------------

describe("isIgnoredPath", () => {
  it("flags a top-level '_drafts' folder as ignored", () => {
    expect(isIgnoredPath("_drafts/wip-npc.md")).toBe(true);
  });

  it("flags an 'archive' folder as ignored", () => {
    expect(isIgnoredPath("archive/old-npc.md")).toBe(true);
  });

  it("flags an 'archived' folder as ignored", () => {
    expect(isIgnoredPath("archived/v1-maps.md")).toBe(true);
  });

  it("flags a 'templates' folder as ignored", () => {
    expect(isIgnoredPath("templates/npc-template.md")).toBe(true);
  });

  it("flags '.obsidian' as ignored", () => {
    expect(isIgnoredPath(".obsidian/config.json")).toBe(true);
  });

  it("flags '.trash' as ignored", () => {
    expect(isIgnoredPath(".trash/deleted.md")).toBe(true);
  });

  it("flags 'deprecated' as ignored", () => {
    expect(isIgnoredPath("deprecated/old-rules.md")).toBe(true);
  });

  it("returns false for a normal content path", () => {
    expect(isIgnoredPath("npcs/goblin-chief.md")).toBe(false);
  });

  it("flags an ignored segment anywhere in a deep path", () => {
    expect(isIgnoredPath("world/npcs/_drafts/wip.md")).toBe(true);
  });

  it("is case-insensitive for ignored-folder detection", () => {
    expect(isIgnoredPath("_DRAFTS/wip.md")).toBe(true);
    expect(isIgnoredPath("Archive/old.md")).toBe(true);
  });
});
