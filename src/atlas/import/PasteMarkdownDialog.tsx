/**
 * Phase 1C C4 — single-file paste dialog. Title + type + body → one .md
 * routed through the unified staging+import pipeline. No table, no conflict
 * matrix: paste is for "I want to capture this one quickly".
 *
 * The actual write still goes through buildStagingRows so the same allowlist
 * and conflict rules apply — we just don't render the multi-row table.
 */
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export interface PasteMarkdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Hand the (filename, raw) shape off to the orchestrator. The orchestrator
   * runs the same staging pipeline as picker/DnD inputs but immediately
   * commits (caller decides — this component just hands over the input).
   */
  onSubmit: (input: { filename: string; raw: string; type: string }) => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function PasteMarkdownDialog({ open, onOpenChange, onSubmit }: PasteMarkdownDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("imports");
  const [body, setBody] = useState("");

  const reset = () => {
    setTitle("");
    setType("imports");
    setBody("");
  };

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const id = slugify(title.trim());
    const filename = `${id || "untitled"}.md`;
    // Build the .md content with frontmatter the import pipeline will parse.
    const raw =
      `---\ntitle: "${title.trim().replace(/"/g, '\\"')}"\natlas:\n  id: ${id || "untitled"}\n  type: ${type}\n  visibility: dm\n---\n\n${body.trim()}\n`;
    onSubmit({ filename, raw, type });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste markdown</DialogTitle>
          <DialogDescription>
            Quick-capture a single entity. Saved as a new <code>.md</code> in the
            inferred folder. Visibility defaults to <strong>DM-only</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="paste-title">Title</Label>
            <Input
              id="paste-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Frosthold Outpost"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="paste-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="paste-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="paste-body">Body</Label>
            <Textarea
              id="paste-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Markdown body — paste content here."
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Create entity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
