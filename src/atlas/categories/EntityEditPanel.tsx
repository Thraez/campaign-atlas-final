import { useEffect, useRef, useState } from "react";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import { useEntityEditDraft, type EntityEditDraftAPI } from "./useEntityEditDraft";
import { saveAtlasPatchToLocalFs, hashContent, type FileChange } from "@/atlas/save/localFsSave";
import { readSourceFile } from "@/atlas/save/canonicalPlacementSave";

export function EntityEditPanel({
  sourcePath,
  onClose,
  onSaved,
  draftApi,
}: {
  sourcePath: string;
  onClose: () => void;
  onSaved: () => void;
  draftApi?: EntityEditDraftAPI;
}) {
  const internal = useEntityEditDraft();
  const api = draftApi ?? internal;
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Keep the original raw file so we can preserve all existing frontmatter fields on save.
  const rawRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    setPhase("loading");
    (async () => {
      try {
        const raw = await readSourceFile(sourcePath, fetch);
        if (!alive) return;
        rawRef.current = raw;
        // No-loss: if a live draft for THIS sourcePath already exists (the user
        // was editing, left Edit, and came back), keep it. Only seed the draft
        // from disk on a genuine first open. rawRef is still refreshed above so
        // Save preserves untouched frontmatter.
        const existing = api.snapshot();
        if (existing && existing.sourcePath === sourcePath) {
          setPhase("ready");
          return;
        }
        const fm = parseFrontmatter(raw);
        const atlas = ((fm.data.atlas as Record<string, unknown>) ?? {});
        const baseHash = await hashContent(raw);
        api.load({
          sourcePath,
          baseHash,
          fields: {
            id: String(atlas.id ?? ""),
            type: String(atlas.type ?? ""),
            visibility: String(atlas.visibility ?? "dm"),
            summary: String(atlas.summary ?? ""),
          },
          body: fm.content,
        });
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    return () => {
      alive = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePath]);

  const onSave = async () => {
    if (!api.draft) return;
    setPhase("saving");
    try {
      const { data } = parseFrontmatter(rawRef.current);
      const atlas: Record<string, unknown> = {
        ...((data.atlas as Record<string, unknown>) ?? {}),
        id: api.draft.fields.id,
        type: api.draft.fields.type,
        visibility: api.draft.fields.visibility,
      };
      if (api.draft.fields.summary) {
        atlas.summary = api.draft.fields.summary;
      } else {
        delete atlas.summary;
      }
      const nextData: Record<string, unknown> = { ...data, atlas };
      const content = stringifyFrontmatter(api.draft.body, nextData);
      const change: FileChange = {
        path: api.draft.sourcePath,
        content,
        kind: "entity-md",
        baseHash: api.draft.baseHash,
      };
      await saveAtlasPatchToLocalFs([change], undefined, { rebuild: true });
      setPhase("saved");
      api.clear();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  if (phase === "loading" || !api.draft) return <div className="p-4 text-xs">Loading…</div>;
  if (phase === "saved") return <div className="p-4 text-xs">Saved.</div>;
  if (phase === "error")
    return (
      <div className="p-4 text-xs text-red-300">
        {error}
        <button className="underline ml-2" onClick={onClose}>
          Close
        </button>
      </div>
    );

  const d = api.draft!;
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        <label className="block">
          <span className="block mb-1">Type</span>
          <input
            aria-label="Type"
            className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.type}
            onChange={(e) => api.setField("type", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block mb-1">Visibility</span>
          <select
            aria-label="Visibility"
            className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.visibility}
            onChange={(e) => api.setField("visibility", e.target.value)}
          >
            {["player", "dm", "hidden", "rumor"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block mb-1">One-line summary</span>
          <input
            className="w-full h-8 px-2 rounded border bg-background"
            value={d.fields.summary}
            onChange={(e) => api.setField("summary", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block mb-1">Body (markdown)</span>
          <textarea
            aria-label="Body"
            rows={16}
            className="w-full px-2 py-1 rounded border bg-background font-mono text-[11px]"
            value={d.body}
            onChange={(e) => api.setBody(e.target.value)}
          />
        </label>
      </div>
      <div className="p-2 border-t flex gap-2 items-center">
        <button type="button" className="h-8 px-3 text-xs rounded border" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="h-8 px-3 text-xs rounded bg-primary text-primary-foreground"
          disabled={phase === "saving"}
          onClick={onSave}
        >
          {phase === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
