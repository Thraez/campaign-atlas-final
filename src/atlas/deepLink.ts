export interface DeepLinkState {
  mapId: string | null;
  entityId: string | null;
  center: { x: number; y: number } | null;
  zoom: number | null;
}

export function serializeDeepLink(state: DeepLinkState): string {
  const params = new URLSearchParams();
  if (state.mapId != null) params.set("map", state.mapId);
  if (state.entityId != null) params.set("entity", state.entityId);
  if (state.center != null) {
    params.set("cx", String(Math.round(state.center.x)));
    params.set("cy", String(Math.round(state.center.y)));
  }
  if (state.zoom != null) params.set("cz", state.zoom.toFixed(1));
  return params.toString();
}

export function parseDeepLink(search: string): DeepLinkState {
  const params = new URLSearchParams(search);
  const mapId = params.get("map") || null;
  const entityId = params.get("entity") || null;
  const cxStr = params.get("cx");
  const cyStr = params.get("cy");
  const czStr = params.get("cz");

  const cx = cxStr !== null ? Number(cxStr) : NaN;
  const cy = cyStr !== null ? Number(cyStr) : NaN;
  const cz = czStr !== null ? Number(czStr) : NaN;

  return {
    mapId,
    entityId,
    center: Number.isFinite(cx) && Number.isFinite(cy) ? { x: cx, y: cy } : null,
    zoom: Number.isFinite(cz) ? cz : null,
  };
}
