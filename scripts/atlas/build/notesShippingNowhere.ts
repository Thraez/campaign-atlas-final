/**
 * Build stage, resolve campaign (R-13): v2 notes whose frontmatter ships
 * (`player` or `rumor`) but that no campaign ships, each with a warning that
 * names the note and every campaign's reason, so the DM sees why it is
 * missing (ADR-0004, "The campaign note default"). The warnings name notes
 * players may not see: the build keeps them out of the player report.
 */
import type { AtlasModel, ModelNote } from "../../../src/atlas/content/atlasModel";
import {
  resolveCampaign,
  type CampaignResolution,
  type ShipReason,
} from "../../../src/atlas/content/resolveCampaign";

const REASONS: Partial<Record<ShipReason, string>> = {
  "not-named": "reads notes: hidden and no world.yaml notes: entry names it",
  entry: "its world.yaml notes: entry doesn't ship it there",
  "stale-entry": "its world.yaml notes: entry is stale (basedOn missing or different)",
  "orphan-entry": "an orphan world.yaml notes: entry with its id hides it",
  "world-hidden": "its world ships no map there (or it is in no listed world folder)",
  "duplicate-id": "another note has the same id",
};

/** One warning per shipping-by-frontmatter note that ships to no campaign. v1 content: none. */
export function notesShippingNowhere(
  model: AtlasModel,
  notes: readonly ModelNote[],
  resolved: ReadonlyMap<string, CampaignResolution> = new Map(),
): string[] {
  if (model.schemaVersion !== 2) return [];
  const resolutions = model.campaigns.map(
    (c) => resolved.get(c.id) ?? resolveCampaign(model, notes, c.id),
  );
  const out: string[] = [];
  for (const n of notes) {
    if (n.note.isSecret) continue;
    const verdicts = resolutions.map((r) => ({
      campaign: r.campaign,
      // A note id shared by two notes has a verdict per note; any refusal counts.
      verdict:
        r.notes.find((v) => v.id === n.note.id && v.world === n.world && !v.ships) ??
        r.notes.find((v) => v.id === n.note.id && v.world === n.world),
    }));
    if (verdicts.some((v) => v.verdict?.ships === true)) continue;
    const why = verdicts
      .map(({ campaign, verdict }) => {
        const reason = verdict?.reason;
        const text = reason ? (REASONS[reason] ?? reason) : "no verdict";
        return `campaign "${campaign}" ${text}`;
      })
      .join("; ");
    out.push(
      `${n.file}: note "${n.note.id}" says ${n.note.visibility} but ships to no campaign — ${why || "the content has no campaign"}`,
    );
  }
  return out;
}
