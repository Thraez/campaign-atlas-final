/**
 * Dev harness for the shared canvas (R-31): `/__canvas?c=<campaign>[&rotated=1]`.
 *
 * Loads one v2 campaign store through the dev server's read-only store server
 * (`scripts/vite-plugin-campaign-stores.ts`), builds the map tree and mounts
 * `AtlasCanvas` on it, with a switch for the rotated fixture. Phase 4's editor
 * reuses it.
 *
 * EDITOR-ONLY: routed in `src/App.tsx` behind `__INCLUDE_EDITOR__`, and its
 * folder is in `src/test/helpers/editorOnlyPaths.ts`, so the player import
 * graph test fails if anything in the player graph reaches it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAtlasProject } from "@/atlas/content/atlasGuard";
import type { AtlasProject } from "@/atlas/content/schema";
import { breadcrumb, buildMapTree } from "@/atlas/ocean/mapTree";
import {
  AtlasCanvas,
  type CanvasCamera,
  type CanvasCameraState,
  type CanvasView,
} from "@/atlas/canvas/AtlasCanvas";
import { DEV_CANVAS_PATHS } from "../../../scripts/atlas/devRoutes";
import { rotatedFixture } from "./rotatedFixture";

const base = () => import.meta.env.BASE_URL.replace(/\/+$/, "");
const storeUrl = (campaign: string, rel: string) =>
  `${base()}${DEV_CANVAS_PATHS.campaignStorePrefix}${encodeURIComponent(campaign)}/${rel}`;

/** Point the store's relative asset paths (`atlas/...`) at the dev store server. */
function withStoreUrls(project: AtlasProject, campaign: string): AtlasProject {
  const prefix = `${DEV_CANVAS_PATHS.campaignStorePrefix}${encodeURIComponent(campaign)}/`;
  return {
    ...project,
    maps: project.maps.map((m) => ({
      ...m,
      layers: m.layers.map((l) =>
        /^\/?atlas\//.test(l.src) ? { ...l, src: prefix + l.src.replace(/^\/?atlas\//, "") } : l,
      ),
    })),
  };
}

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ok"; project: AtlasProject };

function readParams() {
  const q = new URLSearchParams(window.location.search);
  return { campaign: q.get("c") ?? "", rotated: q.get("rotated") === "1" };
}

function writeParams(campaign: string, rotated: boolean) {
  const q = new URLSearchParams();
  if (campaign) q.set("c", campaign);
  if (rotated) q.set("rotated", "1");
  window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
}

export default function CanvasHarnessPage() {
  const [{ campaign, rotated }, setParams] = useState(readParams);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [view, setView] = useState<CanvasView>({ kind: "ocean" });
  const [camera, setCamera] = useState<CanvasCamera>("fit");
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${base()}${DEV_CANVAS_PATHS.campaignStores}`)
      .then((r) => r.json() as Promise<{ campaigns?: unknown }>)
      .then((j) =>
        setCampaigns(
          Array.isArray(j.campaigns)
            ? j.campaigns.filter((c): c is string => typeof c === "string")
            : [],
        ),
      )
      .catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    if (!campaign) {
      setLoad({ state: "error", message: "Pick a campaign (?c=<id>)." });
      return;
    }
    let live = true;
    setLoad({ state: "loading" });
    fetch(storeUrl(campaign, "atlas.json"))
      .then(async (r) => {
        if (!r.ok) throw new Error(`atlas.json: HTTP ${r.status}. Run npm run atlas:publish:next.`);
        return parseAtlasProject(await r.json(), `${campaign}/atlas.json`);
      })
      .then((p) => live && setLoad({ state: "ok", project: withStoreUrls(p, campaign) }))
      .catch(
        (e: unknown) =>
          live && setLoad({ state: "error", message: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      live = false;
    };
  }, [campaign]);

  const tree = useMemo(() => {
    if (load.state !== "ok") return null;
    return buildMapTree(rotated ? rotatedFixture(load.project) : load.project);
  }, [load, rotated]);

  const go = useCallback((next: CanvasView) => {
    setView(next);
    setCamera("fit");
    setHover(null);
  }, []);
  const choose = (c: string, r: boolean) => {
    writeParams(c, r);
    setParams({ campaign: c, rotated: r });
    if (c !== campaign) go({ kind: "ocean" });
  };
  const onCameraChange = useCallback((c: CanvasCameraState) => setCamera(c), []);
  const onEnterMap = useCallback((id: string) => go({ kind: "map", mapId: id }), [go]);

  const crumbs = tree && view.kind === "map" ? breadcrumb(tree, view.mapId) : [];

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm border-b">
        <strong>Canvas harness</strong>
        <label className="flex items-center gap-1">
          Campaign
          <select
            className="border rounded px-1 bg-background"
            value={campaign}
            onChange={(e) => choose(e.target.value, rotated)}
          >
            {!campaigns.includes(campaign) && <option value={campaign}>{campaign || "-"}</option>}
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={rotated}
            onChange={(e) => choose(campaign, e.target.checked)}
          />
          Rotated fixture (ocean 15°, frame 30°)
        </label>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1">
          <button type="button" className="underline" onClick={() => go({ kind: "ocean" })}>
            Ocean
          </button>
          {crumbs
            .filter((c) => c.kind === "map")
            .map((c) =>
              c.kind === "map" ? (
                <span key={c.map.id}>
                  {" > "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => go({ kind: "map", mapId: c.map.id })}
                  >
                    {c.map.name}
                  </button>
                </span>
              ) : null,
            )}
        </nav>
        <span className="text-muted-foreground" data-testid="canvas-harness-status">
          {hover ? `hover: ${hover}` : ""}
          {camera !== "fit" &&
            ` camera: ${camera.center[0].toFixed(0)}, ${camera.center[1].toFixed(0)} z${camera.zoom}`}
        </span>
      </header>
      <main className="flex-1 min-h-0 relative">
        {load.state === "loading" && <p className="p-4">Loading…</p>}
        {load.state === "error" && <p className="p-4 text-destructive">{load.message}</p>}
        {tree && (
          <AtlasCanvas
            tree={tree}
            view={view}
            camera={camera}
            onCameraChange={onCameraChange}
            onEnterMap={onEnterMap}
            onFrameHover={setHover}
          />
        )}
      </main>
    </div>
  );
}
