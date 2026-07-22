import { useState, useCallback, useEffect, useMemo, useRef, forwardRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, X, Link2, Check, Printer, ChevronLeft, ChevronRight } from "lucide-react";
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
import { logger } from "@/lib/logger";
import type { AssetCredit, CreditsConfig, Entity, MapPlacement } from "@/atlas/content/schema";
import type { PlayerProfile } from "@/atlas/profiles/profileTypes";
import { CreditBadge } from "./CreditBadge";
import { mountSecretBlock } from "@/atlas/secrets/secretBlockView";

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
  /** Site-wide credits config from world.credits; defaults both on when absent. */
  credits?: CreditsConfig;
  /** World-level per-asset credit registry, keyed by image src. Takes
   *  precedence over `entity.credit` for any src with a registry entry. */
  assetCredits?: Record<string, AssetCredit>;
}

/**
 * Resolve which credit text (if any) to show for one image src. A registry
 * entry (world.assetCredits[src]) takes precedence when present — shown only
 * when `enabled` and non-empty. With no registry entry, fall back to the
 * entity's coarse `credit` field. Returns null when nothing should show.
 */
function resolveImageCredit(
  src: string,
  assetCredits: Record<string, AssetCredit> | undefined,
  entityCredit: string | undefined,
): string | null {
  const entry = assetCredits?.[src];
  if (entry) {
    return entry.enabled && entry.credit ? entry.credit : null;
  }
  return entityCredit ? entityCredit : null;
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      logger.warn("Copy share link failed", e);
      toast.error("Could not copy link");
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
    if (text && !window.confirm(`Delete your note for "${entityTitle}"? This cannot be undone.`))
      return;
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

  const handleImport = useCallback(
    (file: File) => {
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
    },
    [entityId],
  );

  return (
    <div className="pt-3 border-t border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          My notes{" "}
          {savedAt && (
            <span className="normal-case text-[10px] text-muted-foreground/70 ml-1">
              — saved {formatRelative(savedAt)}
            </span>
          )}
        </span>
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
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExport}
                title="Export all your notes as JSON"
              >
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => importInputRef.current?.click()}
                title="Import notes from JSON"
              >
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
      className="rounded border border-border overflow-hidden hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary block"
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

function PlayerProfileBlock({ profile }: { profile: PlayerProfile }) {
  const hasKnownFor = !!profile.known_for;
  const hasTraits = (profile.visible_traits?.length ?? 0) > 0;
  const hasRumors = (profile.rumors?.length ?? 0) > 0;
  if (!hasKnownFor && !hasTraits && !hasRumors) return null;
  return (
    <div className="atlas-player-profile space-y-2 pt-1" data-testid="player-profile-block">
      {hasKnownFor && (
        <div className="text-sm">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Known for</span>
          <p className="mt-0.5">{profile.known_for}</p>
        </div>
      )}
      {hasTraits && (
        <div className="text-sm">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Visible traits</span>
          <ul className="mt-0.5 list-disc list-inside space-y-0.5">
            {profile.visible_traits!.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {hasRumors && (
        <div className="text-sm">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Rumors</span>
          <ul className="mt-0.5 list-disc list-inside space-y-0.5">
            {profile.rumors!.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const EntityPanel = forwardRef<HTMLDivElement, EntityPanelProps>(function EntityPanel(
  {
    entity,
    placements,
    entityById,
    onOpenEntity,
    onClose,
    onShowOnMap,
    readerAffordances = true,
    onPeek,
    onPeekLeave,
    credits,
    assetCredits,
  },
  ref,
) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Merge the forwarded ref (used by callers) and the local bodyRef (used by the secret effect).
  const setBodyRefs = useCallback(
    (el: HTMLDivElement | null) => {
      (bodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [ref],
  );

  // Post-render: mount SecretBlock DOM views into placeholder spans.
  // Runs whenever the entity body changes (new entity or re-render after edit).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !entity) return;
    const nodes = el.querySelectorAll<HTMLElement>("[data-secret-id]");
    if (nodes.length === 0) return;
    const byId = new Map((entity.secrets ?? []).map((s) => [s.id, s]));
    nodes.forEach((node) => {
      const id = node.getAttribute("data-secret-id");
      const secret = id ? byId.get(id) : undefined;
      if (secret) mountSecretBlock(node, secret);
    });
  }, [entity]);

  const imageCount = entity?.images.length ?? 0;

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i !== null && imageCount > 0 ? (i + 1) % imageCount : null));
  }, [imageCount]);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) =>
      i !== null && imageCount > 0 ? (i - 1 + imageCount) % imageCount : null,
    );
  }, [imageCount]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, goNext, goPrev]);

  // Reset the reading panel to the top whenever the displayed entity changes.
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = 0;
  }, [entity?.id]);

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
  const lightboxSrc = lightboxIndex !== null ? entity.images[lightboxIndex] : null;
  const lightboxUrl = lightboxSrc ? imageUrl(lightboxSrc) : null;
  const lightboxCredit = lightboxSrc
    ? resolveImageCredit(lightboxSrc, assetCredits, entity.credit)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {(() => {
              const typeLabel = playerTypeLabel(entity.type);
              const kicker = [typeLabel, entity.race].filter(Boolean).join(" · ");
              return kicker ? (
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {kicker}
                </div>
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
            <div className="text-xs text-muted-foreground mt-0.5">
              aka {entity.aliases.join(", ")}
            </div>
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
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="p-4 space-y-4">
          {entity.summary && (
            <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">
              {entity.summary}
            </p>
          )}

          {entity.profile?.player && (
            <PlayerProfileBlock profile={entity.profile.player} />
          )}

          {entity.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {entity.images.map((src, i) => {
                const imgCredit = resolveImageCredit(src, assetCredits, entity.credit);
                return (
                  <div key={`${src}-${i}`} className="relative flex-shrink-0">
                    <ImageThumb
                      src={imageUrl(src)}
                      alt={`${entity.title} image ${i + 1}`}
                      onClick={() => setLightboxIndex(i)}
                    />
                    {credits?.badges !== false && imgCredit && <CreditBadge credit={imgCredit} />}
                  </div>
                );
              })}
            </div>
          )}

          {placements.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {placements.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => onShowOnMap(p)}
                >
                  <MapPin className="h-3.5 w-3.5" /> Show on map
                </Button>
              ))}
            </div>
          )}

          <div
            ref={setBodyRefs}
            className="atlas-prose max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(entity.bodyHtml) }}
          />

          {readerAffordances && <NotesPanel entityId={entity.id} entityTitle={entity.title} />}

          {entity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {entity.tags.map((t) => (
                <Link key={t} to={`/atlas/tag/${encodeURIComponent(t)}`}>
                  <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                    #{t}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {entity.backlinks.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Mentioned in
              </div>
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Connections
              </div>
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
                        onMouseEnter={(e) =>
                          onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())
                        }
                        onMouseLeave={() => onPeekLeave?.()}
                        onFocus={(e) => onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())}
                        onBlur={() => onPeekLeave?.()}
                      >
                        {target ? (
                          target.title
                        ) : (
                          <span className="text-muted-foreground">{r.entity}</span>
                        )}
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
      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/90 border-none overflow-hidden">
          <DialogTitle className="sr-only">{entity.title} image</DialogTitle>
          {lightboxIndex !== null && lightboxUrl && (
            <div className="relative">
              <img
                src={lightboxUrl}
                alt={`${entity.title}`}
                className="max-w-full max-h-[85vh] object-contain mx-auto"
                onClick={() => setLightboxIndex(null)}
              />
              {imageCount > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); goPrev(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); goNext(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 hover:bg-black/70 text-white p-2 transition"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div
                    className="absolute top-2 right-2 text-xs text-white/80 bg-black/50 px-2 py-0.5 rounded"
                    aria-label={`Image ${lightboxIndex + 1} of ${imageCount}`}
                    data-testid="lightbox-counter"
                  >
                    {lightboxIndex + 1} / {imageCount}
                  </div>
                </>
              )}
              {credits?.badges !== false && lightboxCredit && (
                <CreditBadge credit={lightboxCredit} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});
