/**
 * Ticket 11 — pin layer benchmark (opt-in: `PIN_BENCH=1 vitest run src/test/map/pinLayer.bench`).
 *
 * Real Leaflet + react-leaflet in jsdom: a wrapping 4000x3000 map with 320 pins
 * (three world copies, so 960 markers). Times the work the player map does on
 * the three viewer changes the ticket names and counts Leaflet `setIcon` calls
 * and `L.divIcon` builds:
 *   - keystroke: the page re-renders with nothing about the map changed (a
 *     search keystroke, a pan's `setViewCenter`, a hover peek);
 *   - zoom: a `zoomend`, which re-decides permanent labels;
 *   - open: one pin becomes the active pin.
 * Skipped in the normal suite: timings are machine-dependent.
 */
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import React, { useState } from "react";
import L from "leaflet";
import { MapContainer } from "react-leaflet";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { FlatCRS } from "@/atlas/map/flatCRS";
import { makeMap } from "../helpers/makeProject";
import { WrappedWorld } from "@/atlas/map/WrappedWorld";

const TYPES = ["settlement", "dungeon", "npc", "ruin", "cave", "temple", "shop", "faction"];
const PINS = 320;

function fixture() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) as number;
  const entities = new Map<string, Entity>();
  const placements: MapPlacement[] = [];
  for (let i = 0; i < PINS; i++) {
    const id = `e-${i}`;
    entities.set(id, {
      id,
      title: `Place ${i}`,
      type: TYPES[i % TYPES.length],
      visibility: i % 10 === 0 ? "rumor" : "player",
      aliases: [],
      tags: [],
      body: "",
      bodyHtml: "",
      frontmatter: {},
      sourcePath: `content/${id}.md`,
      links: [],
      backlinks: [],
      images: [],
    });
    placements.push({
      id: `p-${i}`,
      entityId: id,
      mapId: "overview",
      x: Math.round(rnd() * 4000),
      y: Math.round(rnd() * 3000),
      visibility: "player",
    });
  }
  return { entities, placements };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe.skipIf(!process.env.PIN_BENCH)("pin layer bench (320 pins, wrapX)", () => {
  it("measures keystroke, zoom and open", async () => {
    const { entities, placements } = fixture();
    const map = makeMap({ width: 4000, height: 3000, wrapX: true, layers: [] });
    const visited = new Set<string>();
    const onOpen = () => {};
    const onPeek = () => {};
    const onLeave = () => {};
    let leaflet: L.Map | null = null;
    let bump: () => void = () => {};
    let setOpen: (id: string | null) => void = () => {};

    function Page() {
      const [, setTick] = useState(0);
      const [openId, setOpenId] = useState<string | null>(null);
      bump = () => setTick((t) => t + 1);
      setOpen = setOpenId;
      return (
        <MapContainer
          crs={FlatCRS}
          center={[1500, 2000]}
          zoom={-2}
          minZoom={-5}
          maxZoom={3}
          style={{ width: 1200, height: 800 }}
          ref={(m) => {
            leaflet = m;
          }}
        >
          {[-map.width, 0, map.width].map((dx) => (
            <WrappedWorld
              key={dx}
              dx={dx}
              map={map}
              placements={placements}
              entityById={entities}
              showGrid={null}
              onOpenEntity={onOpen}
              visited={visited}
              openId={openId}
              onPinPeek={onPeek}
              onPinPeekLeave={onLeave}
            />
          ))}
        </MapContainer>
      );
    }

    const setIcon = vi.spyOn(L.Marker.prototype, "setIcon");
    const divIcon = vi.spyOn(L, "divIcon");
    const t0 = performance.now();
    render(<Page />);
    const mount = performance.now() - t0;

    const sample = (fn: () => void, n = 15) => {
      const times: number[] = [];
      setIcon.mockClear();
      divIcon.mockClear();
      for (let i = 0; i < n; i++) {
        const s = performance.now();
        act(fn);
        times.push(performance.now() - s);
      }
      return {
        ms: median(times).toFixed(1),
        setIcon: setIcon.mock.calls.length / n,
        divIcon: divIcon.mock.calls.length / n,
      };
    };

    const keystroke = sample(() => bump());
    let z = -2;
    const zoom = sample(() => {
      z = z === -2 ? 0 : -2;
      leaflet!.setZoom(z, { animate: false });
    });
    let k = 0;
    const open = sample(() => setOpen(`e-${k++ % PINS}`));

    console.log(
      JSON.stringify({
        pins: PINS,
        markers: PINS * 3,
        mountMs: mount.toFixed(0),
        keystroke,
        zoom,
        open,
      }),
    );
    expect(document.querySelectorAll(".atlas-viewer-pin").length).toBe(PINS * 3);
  });
});
