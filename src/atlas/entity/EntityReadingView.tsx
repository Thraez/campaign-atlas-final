import { useMemo } from "react";
import { marked } from "marked";
import type { Entity, MapPlacement } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import { useViewMode } from "@/atlas/view/ViewModeProvider";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

const PLAYER_VISIBLE = new Set(["player", "rumor"]);

export function EntityReadingView({
  entity, entitiesById, placements = [], onOpenEntity, onClose, onShowOnMap,
}: {
  entity: Entity;
  entitiesById: Map<string, Entity>;
  placements?: MapPlacement[];
  onOpenEntity?: (id: string) => void;
  onClose?: () => void;
  onShowOnMap?: (p: MapPlacement) => void;
}) {
  const { mode } = useViewMode();

  const view = useMemo(() => {
    if (mode === "player") {
      return projectEntityForPlayer(entity, buildProjectionContext(entitiesById));
    }
    // DM lens: render raw body (keeps %%dm%%), no redaction, no stripping.
    const byName = new Map<string, string>();
    for (const e of entitiesById.values()) {
      byName.set(e.title.toLowerCase(), e.id);
      for (const a of e.aliases ?? []) byName.set(a.toLowerCase(), e.id);
    }
    const { tokenized, links } = tokenizeWikilinks(entity.body ?? "", {
      resolveByName: (n) => byName.get(n.trim().toLowerCase()),
    });
    const html = marked.parse(tokenized, { async: false }) as string;
    const bodyHtml = sanitizeAtlasHtml(renderLinkTokens(html, links, {}));
    return { ...entity, bodyHtml };
  }, [entity, entitiesById, mode]);

  const notYetVisible = mode === "player" && !PLAYER_VISIBLE.has(entity.visibility);

  return (
    <div className="flex flex-col h-full">
      {notYetVisible && (
        <div className="px-3 py-1.5 text-[11px] bg-amber-500/15 text-amber-200 border-b border-amber-500/30">
          Not yet visible to players — this is how it will look once its visibility is player/rumor.
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <EntityPanel
          entity={view}
          placements={placements}
          entityById={entitiesById}
          onOpenEntity={onOpenEntity ?? (() => {})}
          onClose={onClose ?? (() => {})}
          onShowOnMap={onShowOnMap ?? (() => {})}
          readerAffordances={false}
        />
      </div>
    </div>
  );
}
