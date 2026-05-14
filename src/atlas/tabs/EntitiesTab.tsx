/**
 * Entities tab — edit atlas frontmatter for any entity in the project.
 *
 * Surfaces visibility, summary, aliases, images, profile, and relationships
 * for one entity at a time. Drafts are accumulated per-entity and exported
 * together via the unified entity-frontmatter patch builder. The DM never has
 * to touch raw YAML — but the generated block is always available in the
 * advanced preview.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, ShieldAlert, Printer } from "lucide-react";
import type { AtlasProject, Entity, EntityVisibility } from "@/atlas/content/schema";
import type { EntityProfile, EntityRelationship } from "@/atlas/profiles/profileTypes";
import {
  PLAYER_PROFILE_FIELDS,
  PLAYER_PROFILE_LIST_FIELDS,
  RELATIONSHIP_TYPES,
  dmFieldsForType,
} from "@/atlas/profiles/profileFields";
import { compactProfile, filterRelationshipsForPlayer } from "@/atlas/profiles/profileBuild";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DmMaskingTextarea } from "@/atlas/DmMaskingTextarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabFrame } from "./TabFrame";
import { buildEntityFrontmatterPatch, type EntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";
import { printEntityBundle } from "@/atlas/printHandout";

interface Props {
  project: AtlasProject;
  blockingCount?: number;
  warningCount?: number;
  lastExportAt: number | null;
  onExported: () => void;
}

interface FrontmatterDraft {
  visibility?: EntityVisibility;
  summary?: string;
  aliases?: string[];
  images?: string[];
  type?: string;
  profile?: EntityProfile;
  relationships?: EntityRelationship[];
}

export function EntitiesTab({ project, blockingCount, warningCount, lastExportAt, onExported }: Props) {
  const [drafts, setDrafts] = useState<Record<string, FrontmatterDraft>>({});
  const [selectedId, setSelectedId] = useState<string | null>(project.entities[0]?.id ?? null);

  const selected = useMemo(
    () => project.entities.find((e) => e.id === selectedId),
    [project.entities, selectedId]
  );

  const merged = (e: Entity): { entity: Entity; draft: FrontmatterDraft } => ({
    entity: e,
    draft: drafts[e.id] ?? {},
  });

  const setDraft = (id: string, patch: Partial<FrontmatterDraft>) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), ...patch } }));
  };

  const dirtyCount = Object.keys(drafts).length;

  // Single source of truth for "entity id → visibility" — used by both the
  // patch preview and the in-UI relationship-leak warnings, so the editor
  // can never disagree with the build script's spoiler-check.
  const entityVisibility = useMemo(() => {
    const m = new Map<string, EntityVisibility>();
    for (const e of project.entities) m.set(e.id, e.visibility);
    return m;
  }, [project.entities]);

  const patches: EntityFrontmatterPatch[] = useMemo(() => {
    return Object.entries(drafts).map(([id, d]) => {
      const e = project.entities.find((x) => x.id === id)!;
      const profile = compactProfile(d.profile ?? e.profile);
      return {
        sourcePath: e.sourcePath,
        title: e.title,
        atlas: {
          id: e.id,
          type: d.type ?? e.type,
          visibility: d.visibility ?? e.visibility,
          summary: d.summary ?? e.summary,
          aliases: d.aliases ?? e.aliases,
          images: d.images ?? e.images,
          profile,
          relationships: (d.relationships ?? e.relationships)?.length
            ? d.relationships ?? e.relationships
            : undefined,
        },
      };
    });
  }, [drafts, project.entities]);

  const yamlPreview = useMemo(() => (patches.length ? buildEntityFrontmatterPatch(patches).content : ""), [patches]);

  const exportPatch = () => {
    if (!patches.length) { toast.warning("No entity edits to export."); return; }
    const artifact = buildEntityFrontmatterPatch(patches);
    const result = validatePatchYaml(artifact.content, "entity-frontmatter");
    if (!result.ok) { toast.error(result.errors[0]); return; }
    downloadText(artifact.filename, artifact.content, "text/yaml");
    onExported();
  };

  return (
    <TabFrame
      title="Entities"
      builtFromYamlCount={project.entities.length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
      lastExportAt={lastExportAt}
      onExport={exportPatch}
      exportLabel={`Export ${dirtyCount} patch${dirtyCount === 1 ? "" : "es"}`}
      exportDisabled={dirtyCount === 0}
      rawYamlPreview={yamlPreview}
    >
      <HandoutBundleSection entities={project.entities} />
      <div>
        <Label className="text-[10px]">Entity</Label>
        <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick an entity" /></SelectTrigger>
          <SelectContent>
            {project.entities.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-xs">
                {e.title} {drafts[e.id] ? "•" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <EntityForm
          key={selected.id}
          {...merged(selected)}
          entityVisibility={entityVisibility}
          allEntities={project.entities}
          setDraft={(p) => setDraft(selected.id, p)}
        />
      )}
      {dirtyCount > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setDrafts({})} className="text-xs">
          Discard all local changes ({dirtyCount})
        </Button>
      )}
    </TabFrame>
  );
}

function EntityForm({
  entity,
  draft,
  setDraft,
  entityVisibility,
  allEntities,
}: {
  entity: Entity;
  draft: FrontmatterDraft;
  setDraft: (p: Partial<FrontmatterDraft>) => void;
  entityVisibility: Map<string, EntityVisibility>;
  allEntities: Entity[];
}) {
  const v = (k: keyof FrontmatterDraft, fallback: unknown) => (draft[k] ?? fallback) as never;
  const effectiveType = (draft.type ?? entity.type) as string;
  const effectiveProfile: EntityProfile = draft.profile ?? entity.profile ?? {};
  const effectiveRelationships: EntityRelationship[] = draft.relationships ?? entity.relationships ?? [];

  const setProfile = (next: EntityProfile) => setDraft({ profile: next });
  const setPlayer = (key: string, value: string | string[]) => {
    const player = { ...(effectiveProfile.player ?? {}) } as Record<string, unknown>;
    player[key] = value;
    setProfile({ ...effectiveProfile, player: player as EntityProfile["player"] });
  };
  const setDm = (key: string, value: string) => {
    const dm = { ...(effectiveProfile.dm ?? {}) };
    dm[key] = value;
    setProfile({ ...effectiveProfile, dm });
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-2 bg-card/50">
      <div className="text-[10px] text-muted-foreground font-mono">{entity.sourcePath}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Type</Label>
          <Input value={v("type", entity.type)} onChange={(e) => setDraft({ type: e.target.value })} className="h-7 text-xs" />
        </div>
        <div>
          <Label className="text-[10px]">Visibility</Label>
          <Select value={v("visibility", entity.visibility)} onValueChange={(val) => setDraft({ visibility: val as EntityVisibility })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="player" className="text-xs">player</SelectItem>
              <SelectItem value="dm" className="text-xs">dm</SelectItem>
              <SelectItem value="hidden" className="text-xs">hidden</SelectItem>
              <SelectItem value="rumor" className="text-xs">rumor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-[10px]">Summary</Label>
        <DmMaskingTextarea
          rows={2}
          value={v("summary", entity.summary ?? "")}
          onChange={(next) => setDraft({ summary: next })}
          className="text-xs"
        />
      </div>
      <div>
        <Label className="text-[10px]">Aliases (comma-separated)</Label>
        <Input
          value={(draft.aliases ?? entity.aliases).join(", ")}
          onChange={(e) => setDraft({ aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          className="h-7 text-xs"
        />
      </div>
      <div>
        <Label className="text-[10px]">Images (one per line)</Label>
        <Textarea
          rows={2}
          value={(draft.images ?? entity.images).join("\n")}
          onChange={(e) => setDraft({ images: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          className="text-xs font-mono"
        />
      </div>

      <ProfileSection
        type={effectiveType}
        profile={effectiveProfile}
        onSetPlayer={setPlayer}
        onSetDm={setDm}
      />

      <RelationshipSection
        ownerId={entity.id}
        relationships={effectiveRelationships}
        onChange={(rels) => setDraft({ relationships: rels })}
        entityVisibility={entityVisibility}
        allEntities={allEntities}
      />
    </div>
  );
}

function ProfileSection({
  type,
  profile,
  onSetPlayer,
  onSetDm,
}: {
  type: string;
  profile: EntityProfile;
  onSetPlayer: (key: string, value: string | string[]) => void;
  onSetDm: (key: string, value: string) => void;
}) {
  const dmFields = dmFieldsForType(type);
  const player = profile.player ?? {};
  const dm = profile.dm ?? {};
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Profile · {type}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase text-muted-foreground">Player-visible</div>
        {PLAYER_PROFILE_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-[10px]">{f.label}</Label>
            <DmMaskingTextarea
              rows={2}
              placeholder={f.placeholder}
              value={(player as Record<string, string>)[f.key] ?? ""}
              onChange={(next) => onSetPlayer(f.key, next)}
              className="text-xs"
            />
          </div>
        ))}
        {PLAYER_PROFILE_LIST_FIELDS.map((f) => (
          <ListField
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            values={(player as Record<string, string[]>)[f.key] ?? []}
            onChange={(vals) => onSetPlayer(f.key, vals)}
          />
        ))}
      </div>

      <div className="space-y-2 pt-1 border-t border-border/40">
        <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" /> DM-only — never sent to player builds
        </div>
        {dmFields.map((f) => (
          <div key={f.key}>
            <Label className="text-[10px]">{f.label}</Label>
            <Textarea
              rows={2}
              value={dm[f.key] ?? ""}
              onChange={(e) => onSetDm(f.key, e.target.value)}
              className="text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder?: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <div className="space-y-1">
        {values.map((val, i) => (
          <div key={i} className="flex gap-1">
            <Input
              value={val}
              placeholder={placeholder}
              onChange={(e) => {
                const next = values.slice();
                next[i] = e.target.value;
                onChange(next);
              }}
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={() => onChange([...values, ""])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function RelationshipSection({
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
    [relationships, entityVisibility]
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
                {m.title} <span className="text-muted-foreground">· {m.type} · {m.visibility}</span>
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
                  <span className="text-[9px] uppercase rounded px-1 py-0.5 bg-destructive/15 text-destructive">DM</span>
                )}
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => remove(i)}>
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
                  <ShieldAlert className="h-3 w-3" /> Player-visible relationship points at a DM-only entity — will be
                  stripped from player builds (strict mode fails).
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
                  <Select value={r.visibility} onValueChange={(val) => update(i, { visibility: val as EntityVisibility })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player" className="text-xs">player</SelectItem>
                      <SelectItem value="rumor" className="text-xs">rumor</SelectItem>
                      <SelectItem value="dm" className="text-xs">dm</SelectItem>
                      <SelectItem value="hidden" className="text-xs">hidden</SelectItem>
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

function HandoutBundleSection({ entities }: { entities: Entity[] }) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );
  }, [entities, filter]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const e of filtered) next.add(e.id);
      return next;
    });
  };
  const clear = () => setSelectedIds(new Set());

  const print = () => {
    const ordered = entities.filter((e) => selectedIds.has(e.id));
    if (ordered.length === 0) {
      toast.warning("No entities selected.");
      return;
    }
    printEntityBundle(ordered);
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-border bg-card/40"
    >
      <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Printer className="h-3 w-3" />
        Print handout bundle
        {selectedIds.size > 0 && (
          <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-normal normal-case text-primary">
            {selectedIds.size} selected
          </span>
        )}
      </summary>
      <div className="px-2 pb-2 space-y-2">
        <p className="text-[10px] text-muted-foreground">
          Pick multiple entities to print as one PDF (one entity per page). Single-entity print is on the player viewer.
        </p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title or id…"
          className="h-7 text-xs"
        />
        <div className="max-h-48 overflow-y-auto rounded border border-border/50 bg-background">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-[11px] italic text-muted-foreground">
              No entities match "{filter}".
            </div>
          ) : (
            filtered.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent/50 cursor-pointer border-b border-border/30 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="h-3 w-3"
                />
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-[10px] text-muted-foreground">
                  {e.type} · {e.visibility}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={selectAllFiltered}
              className="h-6 text-[10px]"
              disabled={filtered.length === 0}
            >
              Select {filter ? "filtered" : "all"} ({filtered.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clear}
              className="h-6 text-[10px]"
              disabled={selectedIds.size === 0}
            >
              Clear
            </Button>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={print}
            disabled={selectedIds.size === 0}
            className="h-7 gap-1 text-xs"
          >
            <Printer className="h-3 w-3" /> Print {selectedIds.size || ""} bundle
          </Button>
        </div>
      </div>
    </details>
  );
}
