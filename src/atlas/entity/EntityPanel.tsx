import { useState, useCallback, useEffect, useMemo, useRef, forwardRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, X, Link2, Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  loadNote,
  saveNote,
  deleteNote,
  exportNotesJson,
  importNotesJson,
} from "@/atlas/notes/playerNotes";
import { playerTypeLabel } from "@/atlas/content/typeLabel";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { printEntityHandout } from "@/atlas/printHandout";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import type { Entity, MapPlacement } from "@/atlas/content/schema";

export interface EntityPanelProps {
  entity: Entity | null;
  placements: MapPlacement[];
  /** Entity lookup map — used by downstream slices for cross-entity link resolution. */
  entityById: Map<string, Entity>;
  onOpenEntity: (id: string) => void;
  onClose: () => void;
  onShowOnMap: (p: MapPlacement) => void;
  /** Player-personal affordances (private notes, PDF handout). Default true =
   *  the player site is unchanged. The DM editor passes false. */
  readerAffordances?: boolean;
  onPeek?: (entityId: string, rect: DOMRect) => void;
  onPeekLeave?: () => void;
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, []);
  return (
    <Button variant="ghost" size="icon" onClick={handle} title="Copy share link">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
    </Button>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(t).toLocaleDateString();
}

function NotesPanel({ entityId, entityTitle }: { entityId: string; entityTitle: string }) {
  const initial = useMemo(() => loadNote(entityId), [entityId]);
  const [text, setText] = useState(initial?.text ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);
  const [open, setOpen] = useState(!!initial?.text);
  const debounceRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Reset state when the user navigates to a different entity.
  useEffect(() => {
    const fresh = loadNote(entityId);
    setText(fresh?.text ?? "");
    setSavedAt(fresh?.updatedAt ?? null);
    setOpen(!!fresh?.text);
  }, [entityId]);

  // Debounced autosave.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      saveNote(entityId, text);
      if (text === "") {
        setSavedAt(null);
      } else {
        setSavedAt(new Date().toISOString());
      }
    }, 800) as unknown as number;
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [entityId, text]);

  const handleClear = useCallback(() => {
    if (text && !window.confirm(`Delete your note for "${entityTitle}"? This cannot be undone.`)) return;
    setText("");
    deleteNote(entityId);
    setSavedAt(null);
  }, [entityId, entityTitle, text]);

  const handleExport = useCallback(() => {
    const json = exportNotesJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-player-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = importNotesJson(String(reader.result ?? ""));
      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} note(s)`);
        const fresh = loadNote(entityId);
        setText(fresh?.text ?? "");
        setSavedAt(fresh?.updatedAt ?? null);
      } else if (result.errors.length > 0) {
        toast.error(`Import failed: ${result.errors[0]}`);
      } else {
        toast.message("No notes to import");
      }
    };
    reader.readAsText(file);
  }, [entityId]);

  return (
    <div className="pt-3 border-t border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>My notes {savedAt && <span className="normal-case text-[10px] text-muted-foreground/70 ml-1">— saved {formatRelative(savedAt)}</span>}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Private notes for this entry. Stored only in your browser."
            rows={6}
            className="text-sm"
            aria-label={`Private notes for ${entityTitle}`}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] text-muted-foreground">
              Stored locally in this browser. Never uploaded.
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={handleExport} title="Export all your notes as JSON">
                Export
              </Button>
              <Button size="sm" variant="ghost" onClick={() => importInputRef.current?.click()} title="Import notes from JSON">
                Import
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }}
              />
              {text.length > 0 && (
                <Button size="sm" variant="ghost" onClick={handleClear} title="Clear this note">
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Image thumbnail with broken-image placeholder.
 * Replaces the previous `style.display = none` hide-on-error, which silently
 * suppressed broken thumbnails. A visible placeholder tells the DM "this
 * image is referenced but missing" instead of "this entity has no images."
 */
function ImageThumb({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        className="flex-shrink-0 rounded border border-dashed border-border bg-muted/30 h-24 w-24 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1.5 leading-tight"
        title={`Image failed to load: ${src}`}
      >
        Image missing
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 rounded border border-border overflow-hidden hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <img
        src={src}
        alt={alt}
        className="h-24 w-24 object-cover block"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </button>
  );
}

export const EntityPanel = forwardRef<HTMLDivElement, EntityPanelProps>(function EntityPanel(
  { entity, placements, entityById, onOpenEntity, onClose, onShowOnMap, readerAffordances = true, onPeek, onPeekLeave },
  ref
) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <MapPin className="h-6 w-6 mx-auto opacity-50" />
          <p>Select a pin or search for a place to read its lore.</p>
        </div>
      </div>
    );
  }

  const imageUrl = (src: string) => normalizeAtlasAssetUrl(src);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {(() => {
              const typeLabel = playerTypeLabel(entity.type);
              const kicker = [typeLabel, entity.race].filter(Boolean).join(" · ");
              return kicker ? (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{kicker}</div>
              ) : null;
            })()}
            {entity.visibility === "rumor" && (
              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wider border-amber-500/40 text-amber-500 px-1.5 py-0 h-4"
                title="Rumored — players have heard of this, but it is not confirmed canon."
              >
                Rumored — uncertain
              </Badge>
            )}
          </div>
          <h2 className="font-display text-xl text-foreground truncate">{entity.title}</h2>
          {entity.aliases.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">aka {entity.aliases.join(", ")}</div>
          )}
        </div>
        <div className="flex items-center">
          {readerAffordances && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => printEntityHandout(entity)}
              title="Download as printable handout (PDF)"
              aria-label="Download handout as PDF"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <CopyLinkButton />
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel"><X className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {entity.summary && (
            <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">{entity.summary}</p>
          )}

          {entity.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {entity.images.map((src, i) => (
                <ImageThumb
                  key={`${src}-${i}`}
                  src={imageUrl(src)}
                  alt={`${entity.title} image ${i + 1}`}
                  onClick={() => setLightboxSrc(imageUrl(src))}
                />
              ))}
            </div>
          )}

          {placements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {placements.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" className="gap-1" onClick={() => onShowOnMap(p)}>
                  <MapPin className="h-3.5 w-3.5" /> Show on map
                </Button>
              ))}
            </div>
          )}

          <div
            ref={ref}
            className="atlas-prose prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(entity.bodyHtml) }}
          />

          {readerAffordances && (
            <NotesPanel entityId={entity.id} entityTitle={entity.title} />
          )}

          {entity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {entity.tags.map((t) => (
                <Link key={t} to={`/atlas/tag/${encodeURIComponent(t)}`}>
                  <Badge variant="outline" className="hover:bg-accent cursor-pointer">#{t}</Badge>
                </Link>
              ))}
            </div>
          )}

          {entity.backlinks.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Mentioned in</div>
              <div className="flex flex-wrap gap-1.5">
                {entity.backlinks.map((b) => (
                  <button
                    key={b.id}
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent transition"
                    onClick={() => onOpenEntity(b.id)}
                    onMouseEnter={(e) => onPeek?.(b.id, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => onPeekLeave?.()}
                    onFocus={(e) => onPeek?.(b.id, e.currentTarget.getBoundingClientRect())}
                    onBlur={() => onPeekLeave?.()}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(entity.relationships ?? []).length > 0 && (
            <div className="pt-3 border-t border-border" data-testid="connections-section">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Connections</div>
              <div className="flex flex-col gap-1">
                {(entity.relationships ?? []).map((r, i) => {
                  const target = entityById.get(r.entity);
                  const displayLabel = r.label ?? r.type;
                  return (
                    <div key={`${r.entity}-${i}`} className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground shrink-0">{displayLabel}:</span>
                      <button
                        className="hover:underline truncate text-left"
                        onClick={() => onOpenEntity(r.entity)}
                        onMouseEnter={(e) => onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())}
                        onMouseLeave={() => onPeekLeave?.()}
                        onFocus={(e) => onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())}
                        onBlur={() => onPeekLeave?.()}
                      >
                        {target ? target.title : <span className="text-muted-foreground">{r.entity}</span>}
                      </button>
                      {r.visibility === "dm" && (
                        <span className="text-[10px] text-muted-foreground shrink-0">(DM)</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Lightbox */}
      <Dialog open={!!lightboxSrc} onOpenChange={(open) => !open && setLightboxSrc(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/90 border-none overflow-hidden">
          <DialogTitle className="sr-only">{entity.title} image</DialogTitle>
          {lightboxSrc && (
            <img
              src={lightboxSrc}
              alt={`${entity.title}`}
              className="max-w-full max-h-[85vh] object-contain mx-auto"
              onClick={() => setLightboxSrc(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
