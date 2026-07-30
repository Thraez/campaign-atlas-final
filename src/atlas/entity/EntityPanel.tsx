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
import { downloadBlob } from "@/atlas/tabs/download";
import { normalizeAtlasAssetUrl } from "@/atlas/url";
import { printEntityHandout } from "@/atlas/printHandout";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import { copyToClipboard } from "@/lib/clipboard";
import type { AssetCredit, CreditsConfig, Entity, MapPlacement } from "@/atlas/content/schema";
import type { PlayerProfile } from "@/atlas/profiles/profileTypes";
import { CreditBadge } from "./CreditBadge";
import { resolveImageCredit } from "@/atlas/content/imageCredit";
import { mountSecretBlock } from "@/atlas/secrets/secretBlockView";
import { buildToc } from "@/atlas/entity/paneScrollSync";
import { AtlasImage } from "@/atlas/content/AtlasImage";

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

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
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
    downloadBlob(`atlas-player-notes-${new Date().toISOString().slice(0, 10)}.json`, blob, {
      toast: false,
    });
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
  return (
    <button
      onClick={onClick}
      className="rounded border border-border overflow-hidden hover:border-primary transition focus:outline-none focus:ring-2 focus:ring-primary block flex-shrink-0"
    >
      <AtlasImage
        src={src}
        alt={alt}
        className="h-24 w-24 object-cover block"
        fallbackClassName="h-24 w-24 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1.5 leading-tight bg-muted/30"
        loading="lazy"
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
  const [tocOpen, setTocOpen] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const tocItems = useMemo(() => buildToc(entity?.body ?? ""), [entity?.body]);

  const connectionTargetIds = useMemo(
    () => new Set((entity?.relationships ?? []).map((r) => r.entity)),
    [entity?.relationships],
  );

  const connectionGroups = useMemo(() => {
    const rels = entity?.relationships ?? [];
    const order: string[] = [];
    const groups = new Map<string, typeof rels>();
    for (const r of rels) {
      const label = r.label ?? r.type;
      if (!groups.has(label)) {
        order.push(label);
        groups.set(label, []);
      }
      groups.get(label)!.push(r);
    }
    return order.map((label) => ({ label, rels: groups.get(label)! }));
  }, [entity?.relationships]);

  // Reset TOC to open when navigating to a different entity.
  useEffect(() => {
    setTocOpen(true);
  }, [entity?.id]);

  // Inject data-anchor-id onto rendered body headings so TOC clicks can find them.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || tocItems.length === 0) return;
    el.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => {
      const item = tocItems[i];
      if (item) h.setAttribute("data-anchor-id", item.id);
    });
  }, [tocItems]);

  const scrollToAnchorById = useCallback((anchorId: string) => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    const heading = bodyRef.current?.querySelector<HTMLElement>(
      `[data-anchor-id="${CSS.escape(anchorId)}"]`,
    );
    if (!viewport || !heading) return;
    const delta = heading.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTop += delta;
  }, []);

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
              // dateRaw already drives the Timeline's ordering, so an event that
              // sorts by date used to show no date at all on its own page.
              const kicker = [typeLabel, entity.race, entity.dateRaw]
                .filter(Boolean)
                .join(" · ");
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
              onClick={() => printEntityHandout(entity, entityById, assetCredits, credits)}
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
          {tocItems.length >= 2 && (
            <nav aria-label="On this page" data-testid="on-this-page">
              <button
                type="button"
                className="flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
                onClick={() => setTocOpen((v) => !v)}
                aria-expanded={tocOpen}
              >
                <span>On this page</span>
                <span aria-hidden="true">{tocOpen ? "−" : "+"}</span>
              </button>
              {tocOpen && (
                <ul className="mt-2 space-y-0.5 list-none pl-0">
                  {tocItems.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="text-xs text-left text-muted-foreground hover:text-foreground hover:underline transition w-full truncate"
                        onClick={() => scrollToAnchorById(item.id)}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          )}

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

          <div
            ref={setBodyRefs}
            className="atlas-prose max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeAtlasHtml(entity.bodyHtml) }}
          />

          {/* Actions sit after the prose so the summary flows straight into the
              body — this button used to split the read in two. */}
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

          {entity.backlinks.filter((b) => !connectionTargetIds.has(b.id)).length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Mentioned in
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entity.backlinks
                  .filter((b) => !connectionTargetIds.has(b.id))
                  .map((b) => (
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

          {connectionGroups.length > 0 && (
            <div className="pt-3 border-t border-border" data-testid="connections-section">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Connections
              </div>
              <div className="flex flex-col gap-1">
                {connectionGroups.map(({ label, rels }) => (
                  <div key={label} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground shrink-0">{label}:</span>
                    {rels.map((r, i) => {
                      const target = entityById.get(r.entity);
                      return (
                        <span key={`${r.entity}-${i}`} className="inline-flex items-center gap-1">
                          <button
                            className="hover:underline truncate text-left"
                            onClick={() => onOpenEntity(r.entity)}
                            onMouseEnter={(e) =>
                              onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())
                            }
                            onMouseLeave={() => onPeekLeave?.()}
                            onFocus={(e) =>
                              onPeek?.(r.entity, e.currentTarget.getBoundingClientRect())
                            }
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
                        </span>
                      );
                    })}
                  </div>
                ))}
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
              <AtlasImage
                src={lightboxUrl}
                alt={`${entity.title}`}
                className="max-w-full max-h-[85vh] object-contain mx-auto"
                fallbackClassName="flex items-center justify-center rounded border border-dashed border-white/30 bg-black/40 text-sm text-white/70 text-center px-6 py-16 min-w-[200px] mx-auto"
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
