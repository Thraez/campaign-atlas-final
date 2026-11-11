// The rotated case for the shared canvas (R-31). The v2 test world places
// everything at rotation 0, so the harness and the tests turn it: the first
// top-level map on the ocean by 15 degrees, and the first child framed in it by
// 30 degrees. Pure; returns a copy.

import type { AtlasProject } from "@/atlas/content/schema";

export const OCEAN_TURN = 15;
export const FRAME_TURN = 30;

export function rotatedFixture(project: AtlasProject): AtlasProject {
  const copy = structuredClone(project);
  const first = copy.ocean?.onOcean[0];
  if (!first) return copy;
  first.rotation = OCEAN_TURN;
  const child = copy.maps.find((m) => m.parent === first.map && m.frame);
  if (child?.frame) child.frame.rotation = FRAME_TURN;
  return copy;
}
