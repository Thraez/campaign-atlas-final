/**
 * The viewer's breadcrumb (R-33): "Ocean > <map> > <child>", each crumb but the
 * last a button that goes back to that level. v2 output only; a v1 atlas has no
 * ocean and no breadcrumb.
 *
 * On a phone bar (`compact`, R-38) a trail longer than three levels folds its
 * earlier levels into a "…" menu, and the buttons are 40 px tall.
 *
 * PLAYER-SAFE: reads only the map tree.
 */
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breadcrumb, type BreadcrumbItem, type MapTree } from "../ocean/mapTree";
import type { TreeView } from "../ocean/zoomHandoff";
import { collapseCrumbs } from "./collapseCrumbs";

const labelOf = (c: BreadcrumbItem) => (c.kind === "ocean" ? "Ocean" : c.map.name);
const targetOf = (c: BreadcrumbItem): TreeView =>
  c.kind === "ocean" ? c : { kind: "map", mapId: c.map.id };
const keyOf = (c: BreadcrumbItem) => (c.kind === "ocean" ? "ocean" : c.map.id);

export const COMPACT_MAX_CRUMBS = 3;

export function MapBreadcrumb({
  tree,
  view,
  onGo,
  compact = false,
}: {
  tree: MapTree;
  view: TreeView;
  onGo: (view: TreeView) => void;
  compact?: boolean;
}) {
  const crumbs = view.kind === "map" ? breadcrumb(tree, view.mapId) : [{ kind: "ocean" as const }];
  const { hidden, shown } = compact
    ? collapseCrumbs(crumbs, COMPACT_MAX_CRUMBS)
    : { hidden: [], shown: crumbs };
  const tap = compact ? "min-h-10 px-1" : "";
  const sep = (
    <span aria-hidden="true" className="shrink-0 text-muted-foreground">
      &gt;
    </span>
  );
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
      <ol className="flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap">
        {hidden.length > 0 && (
          <li className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Earlier levels"
                  className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {hidden.map((c) => (
                  <DropdownMenuItem
                    key={keyOf(c)}
                    className="min-h-10"
                    onSelect={() => onGo(targetOf(c))}
                  >
                    {labelOf(c)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
        {shown.map((c, i) => {
          const last = i === shown.length - 1;
          return (
            <li
              key={keyOf(c)}
              className={`flex items-center gap-1 min-w-0 ${last ? "" : "shrink-0"}`}
            >
              {(i > 0 || hidden.length > 0) && sep}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {labelOf(c)}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onGo(targetOf(c))}
                  className={`truncate text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ${tap}`}
                >
                  {labelOf(c)}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
