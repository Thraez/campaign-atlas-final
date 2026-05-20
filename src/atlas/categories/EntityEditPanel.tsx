import { useEffect, useRef, useState } from "react";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import { useEntityEditDraft, type EntityEditDraftAPI } from "./useEntityEditDraft";
import { saveAtlasPatchToLocalFs, hashContent, type FileChange } from "@/atlas/save/localFsSave";
import { readSourceFile } from "@/atlas/save/canonicalPlacementSave";
import { loadAtlasContent } from "@/atlas/content/loader";
import {
  getAutocompleteContext,
  filterEntities,
  filterImages,
  applyCompletion,
  type AutocompleteContext,
  type EntitySuggestion,
} from "@/atlas/editor/wikilinkAutocomplete";
import { WikilinkPopover } from "@/atlas/editor/WikilinkPopover";
import { FormatToolbar } from "@/atlas/editor/FormatToolbar";
import { ImagePickerPanel } from "@/atlas/editor/ImagePickerPanel";
import { applyToolbarAction, type ToolbarActionId } from "@/atlas/editor/toolbarActions";

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

  // Autocomplete state
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [acCtx, setAcCtx] = useState<AutocompleteContext | null>(null);
  const [acIndex, setAcIndex] = useState(0);
  const [entities, setEntities] = useState<
    Array<{ id: string; title: string; type: string; aliases: string[] }>
  >([]);
  const [images, setImages] = useState<string[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // Load entity list once (cached by loadAtlasContent)
  useEffect(() => {
    loadAtlasContent()
      .then((project) =>
        setEntities(
          project.entities.map(({ id, title, type, aliases }) => ({ id, title, type, aliases })),
        ),
      )
      .catch(() => {/* non-fatal — autocomplete just shows nothing */});
  }, []);

  // Fetch image list from dev-only endpoint
  useEffect(() => {
    fetch("/__atlas/assets/images")
      .then((r) => (r.ok ? (r.json() as Promise<{ images: string[] }>) : { images: [] }))
      .then((data) => setImages((data as { images: string[] }).images ?? []))
      .catch(() => {/* non-fatal — dev-only endpoint */});
  }, []);

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

  // ---------- Autocomplete handlers ----------

  const applySelection = (label: string) => {
    if (!acCtx || !textareaRef.current) return;
    const selStart = textareaRef.current.selectionStart;
    const result = applyCompletion(api.draft!.body, acCtx, selStart, label);
    api.setBody(result.value);
    setAcCtx(null);
    setAcIndex(0);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(result.selStart, result.selEnd);
      textareaRef.current?.focus();
    });
  };

  const handleToolbarAction = (id: ToolbarActionId, calloutType?: string) => {
    if (!api.draft || !textareaRef.current) return;
    const ta = textareaRef.current;
    const result = applyToolbarAction(
      id,
      api.draft.body,
      ta.selectionStart,
      ta.selectionEnd,
      calloutType,
    );
    api.setBody(result.value);
    setAcCtx(null);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(result.selStart, result.selEnd);
      textareaRef.current?.focus();
    });
  };

  const handleImageImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const imgPath = `public/atlas/assets/images/${file.name}`;
      saveAtlasPatchToLocalFs(
        [{ path: imgPath, content: dataUrl, kind: "asset-binary", baseHash: null }],
      )
        .then(() => {
          setImages((prev) =>
            prev.includes(file.name) ? prev : [...prev, file.name].sort(),
          );
          applySelection(file.name);
        })
        .catch(() => {/* silently ignore upload errors */});
    };
    reader.readAsDataURL(file);
  };

  const handlePickerSelect = (name: string) => {
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionStart : (api.draft?.body.length ?? 0);
    const insert = `![[${name}]]`;
    const body = api.draft?.body ?? "";
    api.setBody(body.slice(0, pos) + insert + body.slice(pos));
    setShowImagePicker(false);
    requestAnimationFrame(() => {
      if (ta) {
        const end = pos + insert.length;
        ta.setSelectionRange(end, end);
        ta.focus();
      }
    });
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    api.setBody(e.target.value);
    const ctx = getAutocompleteContext(e.target.value, e.target.selectionStart);
    setAcCtx(ctx);
    setAcIndex(0);
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!acCtx) return;
    const filtered =
      acCtx.type === "entity"
        ? filterEntities(entities, acCtx.query)
        : filterImages(images, acCtx.query);
    const maxIndex = Math.max(0, filtered.length - 1);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAcIndex((i) => Math.min(i + 1, maxIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAcIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filtered.length === 0) return;
      e.preventDefault();
      const item = filtered[Math.min(acIndex, maxIndex)];
      applySelection(acCtx.type === "entity" ? (item as EntitySuggestion).id : (item as string));
    } else if (e.key === "Escape") {
      setAcCtx(null);
    }
  };

  // ---------- Render ----------

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
  const filteredEntities = acCtx?.type === "entity" ? filterEntities(entities, acCtx.query) : [];
  const filteredImages = acCtx?.type === "image" ? filterImages(images, acCtx.query) : [];

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
        <div className="block">
          <span className="block mb-1 text-xs">Body (markdown)</span>
          <FormatToolbar
            onAction={handleToolbarAction}
            onInsertImage={() => setShowImagePicker((o) => !o)}
          />
          {showImagePicker && (
            <ImagePickerPanel
              images={images}
              onSelect={handlePickerSelect}
              onImport={handleImageImport}
              onClose={() => setShowImagePicker(false)}
            />
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              aria-label="Body"
              aria-autocomplete="list"
              aria-expanded={acCtx !== null}
              rows={16}
              className="w-full px-2 py-1 rounded border bg-background font-mono text-[11px]"
              value={d.body}
              onChange={handleBodyChange}
              onKeyDown={handleBodyKeyDown}
              onBlur={() => {
                // Small delay so onMouseDown in the popover can fire first
                setTimeout(() => setAcCtx(null), 150);
              }}
            />
            {acCtx && (
              <WikilinkPopover
                ctx={acCtx}
                entityItems={filteredEntities}
                imageItems={filteredImages}
                activeIndex={acIndex}
                onSelect={applySelection}
                onImportImage={handleImageImport}
              />
            )}
          </div>
        </div>
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
