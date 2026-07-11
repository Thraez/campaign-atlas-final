import type { Entity } from "@/atlas/content/schema";
import { revealToHtml } from "./revealSecret";

export interface CollectedSecret {
  entityId: string;
  entityTitle: string;
  secretId: string;
  html: string;
}

/** Try the character key against every character-lock blob; return those it opens. */
export async function collectCharacterSecrets(
  entities: Entity[],
  characterKey: string,
): Promise<CollectedSecret[]> {
  const out: CollectedSecret[] = [];
  for (const e of entities) {
    for (const s of e.secrets ?? []) {
      if (s.lockType !== "character") continue;
      const html = await revealToHtml(s, characterKey);
      if (html !== null) out.push({ entityId: e.id, entityTitle: e.title, secretId: s.id, html });
    }
  }
  return out;
}
