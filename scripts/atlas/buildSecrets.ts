/**
 * Encrypts raw AtlasSecretSpec entries into ship-safe ciphertext blobs.
 * Character secrets are encrypted under the character's key from charKeys;
 * password secrets under their own passphrase. Plaintext/password/key are
 * never placed on the returned blobs.
 */
import { encryptSecret } from "../../src/atlas/secrets/secretCrypto";
import type { PlayerSecret } from "../../src/atlas/content/schema";
import type { AtlasSecretSpec } from "./parseFrontmatter";

export interface BuildSecretsResult {
  secrets: PlayerSecret[];
  warnings: string[];
}

export async function buildEntitySecrets(
  entityId: string,
  specs: AtlasSecretSpec[],
  charKeys: Map<string, string>,
): Promise<BuildSecretsResult> {
  const secrets: PlayerSecret[] = [];
  const warnings: string[] = [];
  for (const spec of specs) {
    let passphrase: string;
    let lockType: PlayerSecret["lockType"];
    let teaser: string | undefined;
    if (spec.for) {
      const key = charKeys.get(spec.for);
      if (!key) {
        warnings.push(`entity "${entityId}": no character key for "${spec.for}" — secret "${spec.id}" skipped`);
        continue;
      }
      passphrase = key;
      lockType = "character";
    } else {
      passphrase = spec.password!;
      lockType = "password";
      teaser = spec.teaser;
    }
    const { salt, iv, ciphertext } = await encryptSecret(spec.reveal, passphrase);
    const blob: PlayerSecret = { id: spec.id, lockType, salt, iv, ciphertext };
    if (teaser) blob.teaser = teaser;
    secrets.push(blob);
  }
  return { secrets, warnings };
}
