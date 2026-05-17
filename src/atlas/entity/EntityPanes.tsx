import { useMemo, useState } from "react";
import { marked } from "marked";
import type { Entity } from "@/atlas/content/schema";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import { tokenizeWikilinks, renderLinkTokens } from "@/atlas/content/parseWikilinks";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

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
    const html = marked.parse(tokenized, { async: false }) as string;
    return sanitizeAtlasHtml(renderLinkTokens(html, links, {}));
  }, [entity, entitiesById]);

  const playerEntity = useMemo(
    () => projectEntityForPlayer(entity, buildProjectionContext(entitiesById)),
    [entity, entitiesById],
  );

  return (
    <div className="flex h-full w-full">
      {mode === "editing" && (
        <section data-testid="entity-pane-edit" className="flex-1 min-w-0 overflow-auto border-r">
          {renderEdit()}
        </section>
      )}

      {(mode === "reading" || showDm) && (
        <section
          data-testid="entity-pane-dm"
          className="flex-1 min-w-0 overflow-auto border-r"
        >
          <div
            className="prose prose-invert max-w-none p-3 text-sm"
            dangerouslySetInnerHTML={{ __html: dmHtml }}
          />
        </section>
      )}

      {showPlayer && (
        <section data-testid="entity-pane-player" className="flex-1 min-w-0 overflow-auto">
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
      )}

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
