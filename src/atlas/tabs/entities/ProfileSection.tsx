import { ShieldAlert } from "lucide-react";
import type { EntityProfile, PlayerProfile } from "@/atlas/profiles/profileTypes";
import {
  PLAYER_PROFILE_FIELDS,
  PLAYER_PROFILE_LIST_FIELDS,
  dmFieldsForType,
} from "@/atlas/profiles/profileFields";
import type { PlayerTextFieldDef, PlayerListFieldDef } from "@/atlas/profiles/profileFields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DmMaskingTextarea } from "@/atlas/DmMaskingTextarea";
import { ListField } from "./ListField";

export function ProfileSection({
  type,
  profile,
  onSetPlayerText,
  onSetPlayerList,
  onSetDm,
}: {
  type: string;
  profile: EntityProfile;
  onSetPlayerText: (key: PlayerTextFieldDef["key"], value: string) => void;
  onSetPlayerList: (key: PlayerListFieldDef["key"], value: string[]) => void;
  onSetDm: (key: string, value: string) => void;
}) {
  const dmFields = dmFieldsForType(type);
  const player: PlayerProfile = profile.player ?? {};
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
              value={player[f.key] ?? ""}
              onChange={(next) => onSetPlayerText(f.key, next)}
              className="text-xs"
            />
          </div>
        ))}
        {PLAYER_PROFILE_LIST_FIELDS.map((f) => (
          <ListField
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            values={player[f.key] ?? []}
            onChange={(vals) => onSetPlayerList(f.key, vals)}
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
