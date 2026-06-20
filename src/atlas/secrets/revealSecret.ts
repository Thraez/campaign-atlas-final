import { decryptSecret } from "./secretCrypto";
import { markdownToHtml } from "@/atlas/content/markdownCore";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";
import type { PlayerSecret } from "@/atlas/content/schema";

/** Decrypt a secret and return safe HTML, or null if the passphrase is wrong. */
export async function revealToHtml(secret: PlayerSecret, passphrase: string): Promise<string | null> {
  const plain = await decryptSecret(secret, passphrase);
  if (plain === null) return null;
  return sanitizeAtlasHtml(markdownToHtml(plain));
}
