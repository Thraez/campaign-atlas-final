/**
 * Entities tab — edit atlas frontmatter for any entity in the project.
 *
 * Surfaces visibility, summary, aliases, images for one entity at a time.
 * Drafts are accumulated per-entity and exported together via the unified
 * entity-frontmatter patch builder. The DM never has to touch raw YAML — but
 * the generated block is always available in the advanced preview.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AtlasProject, Entity, EntityVisibility } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabFrame } from "./TabFrame";
import { buildEntityFrontmatterPatch, type EntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import { validatePatchYaml } from "@/atlas/yaml/validatePatch";
import { downloadText } from "./download";

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

  const patches: EntityFrontmatterPatch[] = useMemo(() => {
    return Object.entries(drafts).map(([id, d]) => {
      const e = project.entities.find((x) => x.id === id)!;
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
      {selected && <EntityForm key={selected.id} {...merged(selected)} setDraft={(p) => setDraft(selected.id, p)} />}
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
}: {
  entity: Entity;
  draft: FrontmatterDraft;
  setDraft: (p: Partial<FrontmatterDraft>) => void;
}) {
  const v = (k: keyof FrontmatterDraft, fallback: unknown) => (draft[k] ?? fallback) as never;
  return (
    <div className="space-y-2 rounded-md border border-border p-2 bg-card/50">
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
        <Textarea
          rows={3}
          value={v("summary", entity.summary ?? "")}
          onChange={(e) => setDraft({ summary: e.target.value })}
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
    </div>
  );
}
