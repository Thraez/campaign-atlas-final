/**
 * Pure resolution of an Obsidian image embed against a vault file index.
 *
 * Two rules, both required:
 *   1. the image must exist in the index;
 *   2. it must sit inside a folder the DM chose.
 *
 * Rule 2 is a secrecy rule, not a tidiness rule: an embed can name an image
 * living in a DM-only folder, and copying that out would publish it. Refusal
 * is reported to the DM, never silent.
 */
export type VaultImageResolution =
  | { ok: true; relPath: string }
  | { ok: false; reason: "not-found" | "outside-candidates" };

function inCandidates(relPath: string, candidateFolders: string[]): boolean {
  if (candidateFolders.length === 0) return true;
  return candidateFolders.some((f) => relPath === f || relPath.startsWith(`${f}/`));
}

export function resolveVaultImage(
  rawSrc: string,
  noteRelPath: string,
  vaultFileIndex: string[],
  candidateFolders: string[],
): VaultImageResolution {
  const src = rawSrc.trim();
  if (!src || src.includes("..")) return { ok: false, reason: "not-found" };

  let hit: string | undefined;
  if (src.includes("/")) {
    // Relative to the note's folder first, then vault-root-relative.
    const noteDir = noteRelPath.split("/").slice(0, -1).join("/");
    const candidates = [noteDir ? `${noteDir}/${src}` : src, src];
    hit = vaultFileIndex.find((p) => candidates.includes(p));
  } else {
    hit = vaultFileIndex.find((p) => (p.split("/").pop() ?? p) === src);
  }

  if (!hit) return { ok: false, reason: "not-found" };
  if (!inCandidates(hit, candidateFolders)) return { ok: false, reason: "outside-candidates" };
  return { ok: true, relPath: hit };
}

/**
 * Target filename for a copied image. Derived from the entity id and an index —
 * never from the source filename, which can itself be a spoiler
 * ("the-cabal-lair.png") and would trip the image-privacy filename scan.
 */
export function vaultImageTargetName(entityId: string, index: number, sourceName: string): string {
  const ext = (sourceName.match(/\.[^.]+$/)?.[0] ?? ".png").toLowerCase();
  return `${entityId}-${index + 1}${ext}`;
}

/**
 * Swap Obsidian image embeds for plain markdown images.
 * An embed with no entry in `copied` was refused or skipped; it is removed
 * rather than left as a broken link or a hint that something exists.
 */
export function rewriteEmbeds(body: string, copied: Record<string, string>): string {
  return body.replace(/!\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    const src = String(inner).split("|")[0].trim();
    const target = copied[src];
    return target ? `![](${target})` : "";
  });
}
