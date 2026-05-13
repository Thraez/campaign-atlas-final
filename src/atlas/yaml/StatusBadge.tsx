import { Badge } from "@/components/ui/badge";
import {
  DRAFT_STATUS_LABEL,
  DRAFT_STATUS_TONE,
  type DraftStatus,
} from "./canon";

const TONE_CLASS: Record<"muted" | "warn" | "info" | "ok", string> = {
  muted: "bg-muted text-muted-foreground border-border",
  info:  "bg-primary/10 text-primary border-primary/30",
  warn:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ok:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

interface Props {
  status: DraftStatus;
  title?: string;
  className?: string;
}

/**
 * Tiny status pill shared by every editor surface.
 *
 * The label intentionally comes from the canon-tier vocabulary
 * ("Built from YAML" / "Local draft" / "Ready to export" / "Exported patch" /
 * "Needs commit") so the DM always knows where their data lives.
 */
export function DraftStatusBadge({ status, title, className }: Props) {
  return (
    <Badge
      variant="outline"
      title={title ?? STATUS_HELP[status]}
      className={`text-[10px] uppercase tracking-wider ${TONE_CLASS[DRAFT_STATUS_TONE[status]]} ${className ?? ""}`}
    >
      {DRAFT_STATUS_LABEL[status]}
    </Badge>
  );
}

const STATUS_HELP: Record<DraftStatus, string> = {
  "built-from-yaml": "Showing the committed YAML canon — no local edits.",
  "local-draft":     "You have unsaved edits in this browser only.",
  "ready-to-export": "Local draft has changes worth exporting as a YAML patch.",
  "exported-patch":  "Patch downloaded — paste it into world.yaml or the entity's frontmatter and commit.",
  "needs-commit":    "A patch was exported but not yet committed. Push it to GitHub to publish.",
};
