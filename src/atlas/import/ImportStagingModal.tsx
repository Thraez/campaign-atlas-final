/**
 * Phase 1C C2 — staging modal for .md import.
 *
 * Thin controlled-component shell over stagingState. The DM picks/drops .md
 * files, reviews this table, and clicks Import. Every row's include /
 * allowlist state is driven by the pure logic in stagingState.ts
 * so the modal never makes its own decisions.
 */

import { useMemo } from "react";
import { AlertTriangle, FileWarning } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StagingRow } from "./stagingState";

/** DM-facing type choices — same list used elsewhere in the editor. */
const TYPE_OPTIONS = [
  "settlement",
  "region",
  "ruin",
  "dungeon",
  "location",
  "map_note",
  "npc",
  "faction",
  "event",
  "item",
  "imports",
];

export interface ImportStagingModalProps {
  open: boolean;
  rows: StagingRow[];
  isImporting?: boolean;
  /** Patch one row by id. Caller threads the patch through updateStagingRow. */
  onPatchRow: (
    id: string,
    patch: { included?: boolean; inferredType?: string; targetPath?: string },
  ) => void;
  onCancel: () => void;
  /** Commit only the included, non-blocked rows. */
  onCommit: () => void;
}

export function ImportStagingModal({
  open,
  rows,
  isImporting,
  onPatchRow,
  onCancel,
  onCommit,
}: ImportStagingModalProps) {
  const includedCount = useMemo(
    () => rows.filter((r) => r.included && r.pathAllowed && !r.parseError).length,
    [rows],
  );
  const blockedCount = useMemo(
    () => rows.filter((r) => r.parseError || !r.pathAllowed).length,
    [rows],
  );
  // A row is "conflicting-but-fixable" if its target already exists on disk
  // but the path and parse are otherwise fine. These default to !included
  // (overwrite requires explicit opt-in), so an import where ALL rows are in
  // this bucket would leave the user with a disabled button and no obvious
  // recourse. A single click on "Select all overwrites" flips them all on at
  // once so the bulk-overwrite case stops being 55 checkbox clicks.
  const conflictRows = useMemo(
    () => rows.filter((r) => r.pathAllowed && !r.parseError && r.rowKind === "path-collision"),
    [rows],
  );
  const uncheckedConflictCount = useMemo(
    () => conflictRows.filter((r) => !r.included).length,
    [conflictRows],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Stage .md import</DialogTitle>
          <DialogDescription>
            Review each file before committing. Target paths are restricted to
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-[10px]">
              content/&lt;world&gt;/{"{places,people,factions,items,events,regions,imports}"}/…
            </code>
            — rows outside that allowlist are red and can't be imported.
            Existing files default to <strong>unchecked</strong>; re-check
            explicitly to overwrite (the previous version is backed up).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] -mx-2 px-2">
          <table className="w-full text-xs border-collapse">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left py-1.5 pr-2 w-6"></th>
                <th className="text-left py-1.5 pr-2">Filename</th>
                <th className="text-left py-1.5 pr-2 w-32">Inferred type</th>
                <th className="text-left py-1.5 pr-2">Target path</th>
                <th className="text-left py-1.5 pr-2 w-44">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const blocked = !!row.parseError || !row.pathAllowed;
                const rowClass = blocked
                  ? "bg-red-500/10 text-red-200"
                  : row.rowKind === "update"
                    ? "bg-sky-500/5"
                    : row.rowKind === "path-collision"
                      ? "bg-amber-500/5"
                      : "";
                return (
                  <tr
                    key={row.id}
                    className={`border-t border-border align-top ${rowClass}`}
                    data-testid={`staging-row-${row.id}`}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Include ${row.filename}`}
                        checked={row.included}
                        disabled={blocked}
                        onChange={(e) => onPatchRow(row.id, { included: e.target.checked })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{row.filename}</span>
                        {row.frontmatterPath && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-muted-foreground underline decoration-dotted cursor-help">
                                  source suggested path
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-[320px] break-all text-[11px]">
                                  Frontmatter <code>path</code>: {row.frontmatterPath} —
                                  ignored. The editor uses the inferred target on the right.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Select
                        value={row.inferredType || "imports"}
                        onValueChange={(v) => onPatchRow(row.id, { inferredType: v })}
                        disabled={!!row.parseError}
                      >
                        <SelectTrigger
                          className="h-7 text-[11px]"
                          aria-label={`Type for ${row.filename}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t} className="text-[11px]">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={row.targetPath}
                        aria-label={`Target path for ${row.filename}`}
                        onChange={(e) => onPatchRow(row.id, { targetPath: e.target.value })}
                        disabled={!!row.parseError}
                        className="h-7 text-[11px] font-mono"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-col gap-1">
                        {row.parseError && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <FileWarning className="h-3 w-3" />
                            Parse error
                          </Badge>
                        )}
                        {!row.parseError && !row.pathAllowed && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Outside allowlist
                          </Badge>
                        )}
                        {/* update: entity already exists — will overwrite in place */}
                        {row.rowKind === "update" && !blocked && (
                          <Badge className="bg-sky-500/20 text-sky-200 border-sky-500/40 text-[10px] gap-1">
                            Update — backup kept
                          </Badge>
                        )}

                        {/* path-collision: a different entity occupies the computed path */}
                        {row.rowKind === "path-collision" && !blocked && !row.included && (
                          <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/40 text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            File exists — check to overwrite
                          </Badge>
                        )}
                        {row.rowKind === "path-collision" && !blocked && row.included && (
                          <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/40 text-[10px] gap-1">
                            Will overwrite — existing file backed up
                          </Badge>
                        )}

                        {/* create: new entity, no conflicts */}
                        {/* (no badge needed for the happy path) */}
                        {row.parseError && (
                          <span className="text-[10px] text-muted-foreground">
                            {row.parseError}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <div className="space-y-0.5">
            {blockedCount > 0 && (
              <div>
                {blockedCount} row{blockedCount === 1 ? "" : "s"} blocked —
                fix the source file or target path to include.
              </div>
            )}
            {uncheckedConflictCount > 0 && (
              <div className="text-amber-300">
                {uncheckedConflictCount} target{uncheckedConflictCount === 1 ? "" : "s"}{" "}
                already exist on disk — re-check to overwrite (the existing file is backed up).
              </div>
            )}
          </div>
          {uncheckedConflictCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] h-7 shrink-0"
              onClick={() => {
                for (const r of conflictRows) {
                  if (!r.included) onPatchRow(r.id, { included: true });
                }
              }}
              disabled={isImporting}
            >
              Select all overwrites
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onCommit}
            disabled={isImporting || includedCount === 0}
          >
            {isImporting ? "Importing…" : `Import ${includedCount} file${includedCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
