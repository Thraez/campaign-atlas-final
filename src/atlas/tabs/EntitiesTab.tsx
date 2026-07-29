/**
 * Entities tab — edit atlas frontmatter for any entity in the project.
 *
 * Surfaces visibility, summary, aliases, images, profile, and relationships
 * for one entity at a time. Drafts are accumulated per-entity and exported
 * together via the unified entity-frontmatter patch builder. The DM never has
 * to touch raw YAML — but the generated block is always available in the
 * advanced preview.
 */
import { useMemo, useRef, useState } from "react";
import { FileUp, ClipboardPaste } from "lucide-react";
import type { AtlasProject, Entity, EntityVisibility } from "@/atlas/content/schema";
import { type FrontmatterDraft, entityFrontmatterPatches } from "@/atlas/save/canonicalEntitySave";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabFrame } from "./TabFrame";
import { buildEntityFrontmatterPatch } from "@/atlas/yaml/buildPatches";
import { EntityForm } from "./entities/EntityForm";
import { HandoutBundleSection } from "./entities/HandoutBundleSection";

interface Props {
  project: AtlasProject;
  blockingCount?: number;
  warningCount?: number;
  /** Phase 1C: open the staging modal with the picked files. */
  onImportMdFiles?: (files: File[]) => void;
  /** Phase 1C: open the paste-markdown dialog. */
  onPasteMarkdown?: () => void;
  /**
   * Controlled draft state — owned by AtlasPlacementEditor so the unified
   * Save can write these edits to disk (no more Export Patch). Keyed by
   * entity id.
   */
  drafts: Record<string, FrontmatterDraft>;
  onDraftsChange: (next: Record<string, FrontmatterDraft>) => void;
}

export function EntitiesTab({
  project,
  blockingCount,
  warningCount,
  onImportMdFiles,
  onPasteMarkdown,
  drafts,
  onDraftsChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(project.entities[0]?.id ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => project.entities.find((e) => e.id === selectedId),
    [project.entities, selectedId],
  );

  const merged = (e: Entity): { entity: Entity; draft: FrontmatterDraft } => ({
    entity: e,
    draft: drafts[e.id] ?? {},
  });

  const setDraft = (id: string, patch: Partial<FrontmatterDraft>) => {
    onDraftsChange({ ...drafts, [id]: { ...(drafts[id] ?? {}), ...patch } });
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

  const patches = useMemo(
    () => entityFrontmatterPatches(drafts, project.entities),
    [drafts, project.entities],
  );

  const yamlPreview = useMemo(
    () => (patches.length ? buildEntityFrontmatterPatch(patches).content : ""),
    [patches],
  );

  return (
    <TabFrame
      title="Entities"
      builtFromYamlCount={project.entities.length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
      rawYamlPreview={yamlPreview}
    >
      {(onImportMdFiles || onPasteMarkdown) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/50 px-2 py-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Add entities
          </span>
          {onImportMdFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) onImportMdFiles(files);
                  // Reset so picking the same file twice re-fires onChange.
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="gap-1 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-3.5 w-3.5" />
                Import .md files…
              </Button>
            </>
          )}
          {onPasteMarkdown && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={onPasteMarkdown}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste markdown
            </Button>
          )}
        </div>
      )}
      <HandoutBundleSection
        entities={project.entities}
        assetCredits={project.worlds[0]?.assetCredits}
        credits={project.worlds[0]?.credits}
      />
      <div>
        <Label className="text-[10px]">Entity</Label>
        <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Pick an entity" />
          </SelectTrigger>
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
        <Button size="sm" variant="ghost" onClick={() => onDraftsChange({})} className="text-xs">
          Discard all local changes ({dirtyCount})
        </Button>
      )}
    </TabFrame>
  );
}
