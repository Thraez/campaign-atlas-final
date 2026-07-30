import { useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";
import type { Entity, EntityVisibility } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";
import { RELATIONSHIP_TYPES } from "@/atlas/profiles/profileFields";
import { filterRelationshipsForPlayer } from "@/atlas/profiles/profileBuild";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RelationshipSection({
  ownerId,
  relationships,
  onChange,
  entityVisibility,
  allEntities,
}: {
  ownerId: string;
  relationships: EntityRelationship[];
  onChange: (next: EntityRelationship[]) => void;
  entityVisibility: Map<string, EntityVisibility>;
  allEntities: Entity[];
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allEntities
      .filter((e) => e.id !== ownerId)
      .filter((e) => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, allEntities, ownerId]);

  // Run the same player-build filter the build script will run, so spoiler
  // leaks are surfaced inline in the editor — no need to wait for a build.
  const playerCheck = useMemo(
    () => filterRelationshipsForPlayer(relationships, { entityVisibility }),
    [relationships, entityVisibility],
  );
  const leakIds = new Set(playerCheck.droppedByLeak.map((r) => r.entity));
  const unresolvedIds = new Set(playerCheck.unresolved.map((r) => r.entity));

  const update = (idx: number, patch: Partial<EntityRelationship>) => {
    const next = relationships.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(relationships.filter((_, i) => i !== idx));
  const add = (entityId: string) => {
    const next: EntityRelationship = { entity: entityId, type: "allied_with", visibility: "dm" };
    onChange([...relationships, next]);
    setSearch("");
  };

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Relationships
      </div>

      <div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entity to link…"
          className="h-7 text-xs"
        />
        {matches.length > 0 && (
          <div className="mt-1 space-y-1 rounded border border-border/50 bg-background p-1">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => add(m.id)}
                className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-accent"
              >
                {m.title}{" "}
                <span className="text-muted-foreground">
                  · {m.type} · {m.visibility}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {relationships.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">No relationships yet.</div>
      )}

      <div className="space-y-2">
        {relationships.map((r, i) => {
          const target = allEntities.find((e) => e.id === r.entity);
          const isLeak = leakIds.has(r.entity) && !unresolvedIds.has(r.entity);
          const isUnresolved = unresolvedIds.has(r.entity);
          return (
            <div key={i} className="space-y-1 rounded border border-border/40 p-2">
              <div className="flex items-center gap-1">
                <div className="flex-1 text-xs font-medium">
                  {target?.title ?? r.entity}
                  <span className="text-muted-foreground ml-1">· {target?.visibility ?? "?"}</span>
                </div>
                {r.visibility !== "player" && r.visibility !== "rumor" && (
                  <span className="text-[9px] uppercase rounded px-1 py-0.5 bg-destructive/15 text-destructive">
                    DM
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => remove(i)}
                  aria-label="Remove link"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {isUnresolved && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> Unresolved entity id "{r.entity}".
                </div>
              )}
              {isLeak && (
                <div className="flex items-center gap-1 text-[10px] text-destructive">
                  <ShieldAlert className="h-3 w-3" /> Player-visible relationship points at a
                  DM-only entity — will be stripped from player builds (strict mode fails).
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <Label className="text-[10px]">Type</Label>
                  <Input
                    list="rel-types"
                    value={r.type}
                    onChange={(e) => update(i, { type: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Visibility</Label>
                  <Select
                    value={r.visibility}
                    onValueChange={(val) => update(i, { visibility: val as EntityVisibility })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player" className="text-xs">
                        player
                      </SelectItem>
                      <SelectItem value="rumor" className="text-xs">
                        rumor
                      </SelectItem>
                      <SelectItem value="dm" className="text-xs">
                        dm
                      </SelectItem>
                      <SelectItem value="hidden" className="text-xs">
                        hidden
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Label (optional)</Label>
                <Input
                  value={r.label ?? ""}
                  onChange={(e) => update(i, { label: e.target.value || undefined })}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px]">Description (optional)</Label>
                <Textarea
                  rows={2}
                  value={r.description ?? ""}
                  onChange={(e) => update(i, { description: e.target.value || undefined })}
                  className="text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>

      <datalist id="rel-types">
        {RELATIONSHIP_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
