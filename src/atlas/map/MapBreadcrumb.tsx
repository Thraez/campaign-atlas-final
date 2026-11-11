/**
 * The viewer's breadcrumb (R-33): "Ocean > <map> > <child>", each crumb but the
 * last a button that goes back to that level. v2 output only; a v1 atlas has no
 * ocean and no breadcrumb.
 *
 * PLAYER-SAFE: reads only the map tree.
 */
import { breadcrumb, type MapTree } from "../ocean/mapTree";
import type { TreeView } from "../ocean/zoomHandoff";

export function MapBreadcrumb({
  tree,
  view,
  onGo,
}: {
  tree: MapTree;
  view: TreeView;
  onGo: (view: TreeView) => void;
}) {
  const crumbs = view.kind === "map" ? breadcrumb(tree, view.mapId) : [{ kind: "ocean" as const }];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
      <ol className="flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const label = c.kind === "ocean" ? "Ocean" : c.map.name;
          const target: TreeView = c.kind === "ocean" ? c : { kind: "map", mapId: c.map.id };
          return (
            <li
              key={c.kind === "ocean" ? "ocean" : c.map.id}
              className={`flex items-center gap-1 min-w-0 ${last ? "" : "shrink-0"}`}
            >
              {i > 0 && (
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                  &gt;
                </span>
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onGo(target)}
                  className="truncate text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
