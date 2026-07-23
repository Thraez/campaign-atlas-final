export interface BrowseFilterState {
  q: string;
  type: string | null;
}

export function parseBrowseFilterParams(params: URLSearchParams): BrowseFilterState {
  const q = params.get("q") ?? "";
  const type = params.get("type") || null;
  return { q, type };
}

export function serializeBrowseFilterParams(state: BrowseFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.type) params.set("type", state.type);
  return params;
}
