import type { Entity, EntityVisibility } from "@/atlas/content/schema";
import type {
  EntityProfile,
  EntityRelationship,
  PlayerProfile,
} from "@/atlas/profiles/profileTypes";
import type { PlayerTextFieldDef, PlayerListFieldDef } from "@/atlas/profiles/profileFields";
import type { FrontmatterDraft } from "@/atlas/save/canonicalEntitySave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DmMaskingTextarea } from "@/atlas/DmMaskingTextarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileSection } from "./ProfileSection";
import { RelationshipSection } from "./RelationshipSection";

export function EntityForm({
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
  // Typed draft accessor: returns the drafted value for `k` or `fallback`,
  // narrowed to the field's own type. Replaces an `as never` hole that
  // silently disabled type-checking on every field value.
  const draftValue = <K extends keyof FrontmatterDraft>(
    k: K,
    fallback: NonNullable<FrontmatterDraft[K]>,
  ): NonNullable<FrontmatterDraft[K]> => draft[k] ?? fallback;
  const effectiveType = draft.type ?? entity.type;
  const effectiveProfile: EntityProfile = draft.profile ?? entity.profile ?? {};
  const effectiveRelationships: EntityRelationship[] =
    draft.relationships ?? entity.relationships ?? [];

  const setProfile = (next: EntityProfile) => setDraft({ profile: next });
  const setPlayerText = (key: PlayerTextFieldDef["key"], value: string) => {
    const player: PlayerProfile = { ...effectiveProfile.player, [key]: value };
    setProfile({ ...effectiveProfile, player });
  };
  const setPlayerList = (key: PlayerListFieldDef["key"], value: string[]) => {
    const player: PlayerProfile = { ...effectiveProfile.player, [key]: value };
    setProfile({ ...effectiveProfile, player });
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
          <Input
            value={draftValue("type", entity.type)}
            onChange={(e) => setDraft({ type: e.target.value })}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">Visibility</Label>
          <Select
            value={draftValue("visibility", entity.visibility)}
            onValueChange={(val) => setDraft({ visibility: val as EntityVisibility })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="player" className="text-xs">
                player
              </SelectItem>
              <SelectItem value="dm" className="text-xs">
                dm
              </SelectItem>
              <SelectItem value="hidden" className="text-xs">
                hidden
              </SelectItem>
              <SelectItem value="rumor" className="text-xs">
                rumor
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-[10px]">Summary</Label>
        <DmMaskingTextarea
          rows={2}
          value={draftValue("summary", entity.summary ?? "")}
          onChange={(next) => setDraft({ summary: next })}
          className="text-xs"
        />
      </div>
      <div>
        <Label className="text-[10px]">Aliases (comma-separated)</Label>
        <Input
          value={(draft.aliases ?? entity.aliases).join(", ")}
          onChange={(e) =>
            setDraft({
              aliases: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="h-7 text-xs"
        />
      </div>
      <div>
        <Label className="text-[10px]">Images (one per line)</Label>
        <Textarea
          rows={2}
          value={(draft.images ?? entity.images).join("\n")}
          onChange={(e) =>
            setDraft({
              images: e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="text-xs font-mono"
        />
      </div>

      <ProfileSection
        type={effectiveType}
        profile={effectiveProfile}
        onSetPlayerText={setPlayerText}
        onSetPlayerList={setPlayerList}
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
