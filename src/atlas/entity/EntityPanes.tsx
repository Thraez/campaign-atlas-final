import { useEffect, useMemo, useState, useRef } from "react";
import { markdownToHtml } from "@/atlas/content/markdownCore";
import type { Entity } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import { buildAnchors, mapScroll } from "@/atlas/entity/paneScrollSync";

type Mode = "reading" | "editing";

export function EntityPanes({
  entity, entitiesById, mode, renderEdit,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  mode: Mode;
  renderEdit: () => React.ReactNode;
}) {
  // In reading mode the DM pane is always visible.
  // In editing mode the DM pane starts hidden and can be expanded.
  const [showDm, setShowDm] = useState(mode === "reading");
  const [showPlayer, setShowPlayer] = useState(false);

  const dmHtml = useMemo(() => {
    const byName = new Map<string, string>();
    for (const e of entitiesById.values()) {
      byName.set(e.title.toLowerCase(), e.id);
      for (const a of e.aliases ?? []) byName.set(a.toLowerCase(), e.id);
    }
    const { tokenized, links } = tokenizeWikilinks(entity.body ?? "", {
      resolveByName: (n) => byName.get(n.trim().toLowerCase()),
    });
    const html = markdownToHtml(tokenized);
    return sanitizeAtlasHtml(renderLinkTokens(html, links, {}));
  }, [entity, entitiesById]);

  const playerEntity = useMemo(
    () => projectEntityForPlayer(entity, buildProjectionContext(entitiesById)),
    [entity, entitiesById],
  );

  // --- Anchor-sync refs and helpers ---
  const dmRef = useRef<HTMLElement>(null);
  const playerRef = useRef<HTMLElement>(null);
  const syncing = useRef(false);

  const dmAnchors = useMemo(() => buildAnchors(entity.body ?? ""), [entity.body]);
  const playerAnchors = useMemo(() => buildAnchors(playerEntity.body ?? ""), [playerEntity.body]);

  const tagHeadings = (html: string, anchors: ReturnType<typeof buildAnchors>): string => {
    let i = 0;
    return html.replace(/<(h[1-6])>/g, (_full, tag) => {
      const a = anchors[i++];
      return a ? `<${tag} data-anchor-id="${a.id}">` : `<${tag}>`;
    });
  };

  const topAnchorId = (el: HTMLElement | null, anchors: ReturnType<typeof buildAnchors>): string | null => {
    if (!el) return null;
    let best: string | null = null;
    for (const a of anchors) {
      const h = el.querySelector(`[data-anchor-id="${CSS.escape(a.id)}"]`) as HTMLElement | null;
      if (!h) continue;
      if (h.offsetTop - el.scrollTop <= 4) {
        best = a.id;
      } else {
        break;
      }
    }
    return best;
  };

  const scrollToAnchor = (el: HTMLElement | null, id: string) => {
    if (!el) return;
    const h = el.querySelector(`[data-anchor-id="${CSS.escape(id)}"]`) as HTMLElement | null;
    if (h) el.scrollTop = h.offsetTop;
  };

  const onDmScroll = () => {
    if (syncing.current) return;
    const fromId = topAnchorId(dmRef.current, dmAnchors);
    if (!fromId) return;
    const toId = mapScroll({ from: dmAnchors, to: playerAnchors, fromAnchorId: fromId });
    if (!toId) return;
    syncing.current = true;
    scrollToAnchor(playerRef.current, toId);
    requestAnimationFrame(() => { syncing.current = false; });
  };

  const onPlayerScroll = () => {
    if (syncing.current) return;
    const fromId = topAnchorId(playerRef.current, playerAnchors);
    if (!fromId) return;
    const toId = mapScroll({ from: playerAnchors, to: dmAnchors, fromAnchorId: fromId });
    if (!toId) return;
    syncing.current = true;
    scrollToAnchor(dmRef.current, toId);
    requestAnimationFrame(() => { syncing.current = false; });
  };

  // EntityPanel renders bodyHtml as bare DOM — inject data-anchor-id so scrollToAnchor can find headings.
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    el.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h, i) => {
      const a = playerAnchors[i];
      if (a) h.setAttribute("data-anchor-id", a.id);
    });
  }, [playerAnchors]);

  return (
    <div className="flex h-full w-full">
      {mode === "editing" && (
        <section data-testid="entity-pane-edit" className="flex-1 min-w-0 overflow-auto border-r">
          {renderEdit()}
        </section>
      )}

      <section
        ref={dmRef as React.Ref<HTMLElement>}
        data-testid="entity-pane-dm"
        className="flex-1 min-w-0 overflow-auto border-r"
        style={{ display: (mode === "reading" || showDm) ? undefined : "none" }}
        onScroll={onDmScroll}
      >
        <div
          className="prose prose-invert max-w-none p-3 text-sm"
          dangerouslySetInnerHTML={{ __html: tagHeadings(dmHtml, dmAnchors) }}
        />
      </section>

      {/* Player pane: always mounted (persistent-DOM); hidden via display:none when collapsed. */}
      <section
        ref={playerRef as React.Ref<HTMLElement>}
        data-testid="entity-pane-player"
        className="flex-1 min-w-0 overflow-auto"
        style={{ display: showPlayer ? undefined : "none" }}
        onScroll={onPlayerScroll}
      >
        <EntityPanel
          entity={playerEntity}
          placements={[]}
          entityById={entitiesById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          readerAffordances={false}
        />
      </section>

      <div className="flex flex-col gap-1 p-1 border-l bg-muted/30">
        {mode === "editing" && !showDm && (
          <button
            type="button"
            className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowDm(true)}
          >
            ＋ Add DM view
          </button>
        )}
        {!showPlayer && (
          <button
            type="button"
            className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowPlayer(true)}
          >
            ＋ Add Player view
          </button>
        )}
        {showPlayer && (
          <button
            type="button"
            className="text-[10px] px-1 py-2 rounded border [writing-mode:vertical-rl]"
            onClick={() => setShowPlayer(false)}
          >
            － Player view
          </button>
        )}
      </div>
    </div>
  );
}
