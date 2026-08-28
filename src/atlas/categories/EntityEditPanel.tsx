import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { isValidVisibility, ALL_VISIBILITY } from "@/atlas/content/visibility";
import { parseFrontmatter, stringifyFrontmatter } from "@/atlas/import/frontmatter";
import {
  useEntityEditDraft,
  type EntityEditDraftAPI,
  type DraftSecret,
} from "./useEntityEditDraft";
import { saveAtlasPatchToLocalFs, hashContent, type FileChange } from "@/atlas/save/localFsSave";
import { editorImageTargetName } from "@/atlas/assets/imageEncoding";
import { fileToDataUrl } from "@/atlas/content/browserFile";
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
  initialType,
}: {
  sourcePath: string;
  onClose: () => void;
  onSaved: () => void;
  draftApi?: EntityEditDraftAPI;
  /**
   * Pre-apply a type to the draft on open — used by the "File as …" action on a
   * misfiled note. Applied *after* the draft is seeded from disk so `pristine`
   * still reflects the file and the change registers as unsaved work.
   */
  initialType?: string;
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
  const [charNames, setCharNames] = useState<string[]>([]);

  // Load entity list once (cached by loadAtlasContent)
  useEffect(() => {
    loadAtlasContent()
      .then((project) =>
        setEntities(
          project.entities.map(({ id, title, type, aliases }) => ({ id, title, type, aliases })),
        ),
      )
      .catch(() => {
        /* non-fatal — autocomplete just shows nothing */
      });
  }, []);

  // Fetch image list from dev-only endpoint
  useEffect(() => {
    fetch("/__atlas/assets/images")
      .then((r) => (r.ok ? (r.json() as Promise<{ images: string[] }>) : { images: [] }))
      .then((data) => setImages((data as { images: string[] }).images ?? []))
      .catch(() => {
        /* non-fatal — dev-only endpoint */
      });
  }, []);

  // Fetch character names from the DM keys file to populate the "for:" dropdown.
  useEffect(() => {
    const parts = sourcePath.replace(/\\/g, "/").split("/");
    if (parts.length < 2) return;
    const keysPath = `${parts[0]}/${parts[1]}/_dm/character-keys.yaml`;
    readSourceFile(keysPath, fetch)
      .then((content) => {
        const names: string[] = [];
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (
            trimmed &&
            !trimmed.startsWith("#") &&
            !trimmed.startsWith(" ") &&
            trimmed.includes(":")
          ) {
            const name = trimmed.split(":")[0].trim();
            if (name) names.push(name);
          }
        }
        setCharNames(names);
      })
      .catch(() => {
        /* non-fatal — keys file may not exist yet */
      });
  }, [sourcePath]);

  useEffect(() => {
    let alive = true;
    setPhase("loading");
    (async () => {
      try {
        const raw = await readSourceFile(sourcePath, fetch);
        if (!alive) return;
        rawRef.current = raw;
        const fm = parseFrontmatter(raw);
        const atlas = (fm.data.atlas as Record<string, unknown>) ?? {};
        // No-loss: if a live draft for THIS sourcePath already exists (the user
        // was editing, left Edit, and came back), keep it — including any
        // in-progress secret edits, which now live on the shared draft instead
        // of local state. Only seed the draft from disk on a genuine first
        // open. rawRef is still refreshed above so Save preserves untouched
        // frontmatter.
        const diskType = String(atlas.type ?? "");
        const existing = api.snapshot();
        if (existing && existing.sourcePath === sourcePath) {
          // Re-filing an entity the DM already had open: still honour the
          // requested type, but keep the rest of their in-progress draft.
          if (initialType && initialType !== existing.fields.type) {
            api.setField("type", initialType);
          }
          setPhase("ready");
          return;
        }
        const baseHash = await hashContent(raw);
        api.load({
          sourcePath,
          baseHash,
          fields: {
            id: String(atlas.id ?? ""),
            type: diskType,
            visibility: isValidVisibility(atlas.visibility) ? atlas.visibility : "dm",
            summary: String(atlas.summary ?? ""),
          },
          body: fm.content,
          secrets: Array.isArray(atlas.secrets) ? (atlas.secrets as DraftSecret[]) : [],
        });
        // Seeded from disk above so `pristine` is the file's state; applying the
        // type now makes it a genuine unsaved change the DM can see and Save.
        if (initialType && initialType !== diskType) api.setField("type", initialType);
        setPhase("ready");
      } catch (e) {
        if (!alive) return;
        logger.error("Entity load failed", e);
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
      const filteredSecrets = api.draft.secrets.filter((s) => s.reveal.trim().length > 0);
      if (filteredSecrets.length > 0) {
        atlas.secrets = filteredSecrets;
      } else {
        delete atlas.secrets;
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
      logger.error("Entity save failed", e);
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

  const handleAddSecret = (type: "character" | "password") => {
    if (!api.draft || !textareaRef.current) return;
    const ta = textareaRef.current;
    const oldBody = api.draft.body;
    const actionId = type === "character" ? "secret:character" : "secret:password";
    const result = applyToolbarAction(actionId, oldBody, ta.selectionStart, ta.selectionEnd);
    api.setBody(result.value);
    setAcCtx(null);
    // Extract the newly generated secret ID by diffing old vs new markers
    const oldIds = new Set([...oldBody.matchAll(/\{\{secret:([^}]+)\}\}/g)].map((m) => m[1]));
    const newId = [...result.value.matchAll(/\{\{secret:([^}]+)\}\}/g)]
      .map((m) => m[1])
      .find((id) => !oldIds.has(id));
    if (newId) {
      const scaffold: DraftSecret =
        type === "character"
          ? { id: newId, for: "", reveal: "" }
          : { id: newId, password: "", teaser: "", reveal: "" };
      api.setSecrets((prev) => [...prev, scaffold]);
    }
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(result.selStart, result.selEnd);
      textareaRef.current?.focus();
    });
  };

  const handleImageImport = (file: File) => {
    fileToDataUrl(file)
      .then((dataUrl) => {
        // Naming and encoding are one decision, made here: a `.webp` target
        // tells the save endpoint to convert. Painted PNG portraits are ~16x
        // smaller as WebP, and the DM never has to think about it.
        const safeName = editorImageTargetName(file.name, file.type);
        const imgPath = `public/atlas/assets/images/${safeName}`;
        return saveAtlasPatchToLocalFs([
          { path: imgPath, content: dataUrl, kind: "asset-binary", baseHash: null },
        ]).then(() => {
          setImages((prev) => (prev.includes(safeName) ? prev : [...prev, safeName].sort()));
          applySelection(safeName);
        });
      })
      .catch((e: unknown) => {
        logger.error("Image upload failed", e);
        toast.error(`Image upload failed: ${e instanceof Error ? e.message : String(e)}`);
      });
  };

  const handleImageDelete = (name: string) => {
    fetch(`/__atlas/assets/images?name=${encodeURIComponent(name)}`, { method: "DELETE" })
      .then((r) => {
        if (r.ok) {
          setImages((prev) => prev.filter((n) => n !== name));
        } else {
          r.json().then(
            (body: unknown) => {
              const detail = (body as { error?: string })?.error ?? r.status;
              logger.error("Image delete failed", detail);
              toast.error(`Delete failed: ${detail}`);
            },
            () => {
              logger.error("Image delete failed", r.status);
              toast.error(`Delete failed: ${r.status}`);
            },
          );
        }
      })
      .catch((e: unknown) => {
        logger.error("Image delete failed", e);
        toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      });
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
    // Q41: Cmd/Ctrl+B/I/K formatting shortcuts, routed through the same
    // toolbar pipeline as the buttons. Only when the autocomplete popover is
    // closed — with it open, the modifier combo is reserved for navigating
    // suggestions.
    if (!acCtx && (e.metaKey || e.ctrlKey)) {
      const key = e.key.toLowerCase();
      const actionId: ToolbarActionId | undefined =
        key === "b" ? "bold" : key === "i" ? "italic" : key === "k" ? "wikilink" : undefined;
      if (actionId) {
        e.preventDefault();
        handleToolbarAction(actionId);
        return;
      }
    }
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

  // B2: check error/saved BEFORE the loading guard. On a failed load (e.g. the
  // source .md is missing → /__atlas/read 404), api.load() never runs so
  // api.draft stays null; if the loading guard ran first, its `!api.draft`
  // clause would swallow the error state and hang forever on "Loading…".
  if (phase === "error")
    return (
      <div className="p-4 text-xs text-red-300 space-y-2">
        <p>{error ?? "Couldn't open this entry for editing."}</p>
        <p className="text-muted-foreground">
          Its source file may be missing. Rebuild the atlas (restart the dev server or run{" "}
          <code className="font-mono">npm run atlas:build</code>) so the list matches what's on
          disk.
        </p>
        <button className="underline" onClick={onClose}>
          Close
        </button>
      </div>
    );
  if (phase === "saved") return <div className="p-4 text-xs">Saved.</div>;
  // "saving" intentionally falls through to the form (Save button shows "Saving…").
  if (phase === "loading" || !api.draft) return <div className="p-4 text-xs">Loading…</div>;

  const d = api.draft!;
  const filteredEntities = acCtx?.type === "entity" ? filterEntities(entities, acCtx.query) : [];
  const filteredImages = acCtx?.type === "image" ? filterImages(images, acCtx.query) : [];
  const acItemCount = acCtx?.type === "entity" ? filteredEntities.length : filteredImages.length;
  const acClampedIndex = Math.min(acIndex, Math.max(0, acItemCount - 1));

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
            onChange={(e) => {
              if (isValidVisibility(e.target.value)) api.setField("visibility", e.target.value);
            }}
          >
            {ALL_VISIBILITY.map((v) => (
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
              onDelete={handleImageDelete}
              onClose={() => setShowImagePicker(false)}
            />
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              aria-label="Body"
              aria-autocomplete="list"
              aria-expanded={acCtx !== null}
              aria-controls={acCtx ? "wikilink-popover-listbox" : undefined}
              aria-activedescendant={
                acCtx && acItemCount > 0 ? `wikilink-option-${acClampedIndex}` : undefined
              }
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
        {/* Secrets section */}
        <div className="block">
          <span className="block mb-1 text-xs font-medium">Secrets</span>
          {d.secrets.length > 0 && (
            <div className="space-y-2 mb-2">
              {d.secrets.map((s, i) => (
                <div key={s.id} className="border rounded p-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">{`{{secret:${s.id}}}`}</span>
                    <button
                      type="button"
                      aria-label={`Remove secret ${s.id}`}
                      className="text-xs text-red-400 hover:text-red-600"
                      onClick={() => api.setSecrets((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                  {"for" in s ? (
                    <label className="block">
                      <span className="block mb-0.5">Character</span>
                      {charNames.length > 0 ? (
                        <select
                          aria-label="Character for secret"
                          className="w-full h-7 px-1 rounded border bg-background text-xs"
                          value={s.for ?? ""}
                          onChange={(e) =>
                            api.setSecrets((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, for: e.target.value } : x)),
                            )
                          }
                        >
                          <option value="">— pick a character —</option>
                          {charNames.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full h-7 px-1 rounded border bg-background text-xs"
                          placeholder="Character name"
                          value={s.for ?? ""}
                          onChange={(e) =>
                            api.setSecrets((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, for: e.target.value } : x)),
                            )
                          }
                        />
                      )}
                    </label>
                  ) : (
                    <>
                      <label className="block">
                        <span className="block mb-0.5">Password (passphrase)</span>
                        <input
                          className="w-full h-7 px-1 rounded border bg-background text-xs"
                          placeholder="the tide remembers"
                          value={s.password ?? ""}
                          onChange={(e) =>
                            api.setSecrets((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, password: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="block mb-0.5">Teaser (public hint, optional)</span>
                        <input
                          className="w-full h-7 px-1 rounded border bg-background text-xs"
                          placeholder="Only a true fjordmark person knows this"
                          value={s.teaser ?? ""}
                          onChange={(e) =>
                            api.setSecrets((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, teaser: e.target.value } : x)),
                            )
                          }
                        />
                      </label>
                    </>
                  )}
                  <label className="block">
                    <span className="block mb-0.5">Reveal text (markdown)</span>
                    <textarea
                      rows={3}
                      className="w-full px-1 py-0.5 rounded border bg-background font-mono text-[11px]"
                      placeholder="The reveal the player sees once unlocked…"
                      value={s.reveal}
                      onChange={(e) =>
                        api.setSecrets((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, reveal: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="h-7 px-2 text-xs rounded border"
              onClick={() => handleAddSecret("character")}
            >
              + Add character secret
            </button>
            <button
              type="button"
              className="h-7 px-2 text-xs rounded border"
              onClick={() => handleAddSecret("password")}
            >
              + Add puzzle secret
            </button>
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
