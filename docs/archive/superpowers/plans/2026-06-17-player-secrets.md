# Player Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the DM author character-specific and puzzle secrets that ship to the static player site as real AES-encrypted ciphertext and reveal only on the correct passphrase or character key — with a build-time scan that fails publish if any plaintext, passphrase, or key leaks.

**Architecture:** Secrets are authored in entity frontmatter (`atlas.secrets`) + a `{{secret:id}}` body marker. At build time the plaintext is encrypted (AES-256-GCM via Web Crypto, the same module in Node and browser) under a per-secret password or a per-character key loaded from a DM-only file; only ciphertext blobs (`entity.secrets[]`) ship. The player site substitutes the marker for a placeholder span, and a client effect decrypts on demand and re-sanitizes the revealed markdown. A new `check-player-secrets` scan, wired into the publish gate, fails the build on any leak.

**Tech Stack:** TypeScript, React, Vite, Leaflet, Vitest, Web Crypto (`globalThis.crypto.subtle`), gray-matter, js-yaml.

**Spec:** `docs/superpowers/specs/2026-06-17-player-secrets-design.md` (read it first).

**Test command convention:** run single files to avoid the whole-suite OOM — `npx vitest run <path>`. Scan-CLI tests shell out via `tsx` (mirror existing `src/test/safety-fortress.test.ts`).

**HTML insertion note:** several tasks insert already-sanitized HTML into the DOM. They use `document.createRange().createContextualFragment(safeHtml)` + `el.replaceChildren(frag)` — a standard parse-to-nodes API. The string is always the output of `sanitizeAtlasHtml`, so it is safe; this mirrors how the reading pane already renders `bodyHtml`.

**Commit convention:** `feat(secrets): <what>` after each task's tests pass.

---

## Phase 0 — Crypto core (the foundation everything else trusts)

### Task 1: Shared encrypt/decrypt module (Web Crypto, Node + browser)

**Files:**
- Create: `src/atlas/secrets/secretCrypto.ts`
- Test: `src/test/secrets/secretCrypto.test.ts`

**Why one module:** `globalThis.crypto.subtle` (Web Crypto) exists in Node 20+ *and* browsers, so a single module guarantees the build's ciphertext decrypts in the player's browser. AES-GCM via Web Crypto appends the 16-byte auth tag automatically on both sides, eliminating the Node/browser tag-convention mismatch the spec warns about.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/secretCrypto.test.ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/atlas/secrets/secretCrypto";

describe("secretCrypto", () => {
  it("round-trips plaintext under the correct passphrase", async () => {
    const blob = await encryptSecret("the onyx signet you recognised", "the tide remembers");
    expect(blob.salt).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(blob.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(blob.ciphertext).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(blob.ciphertext.includes("onyx")).toBe(false);
    const out = await decryptSecret(blob, "the tide remembers");
    expect(out).toBe("the onyx signet you recognised");
  });

  it("returns null for a wrong passphrase (GCM auth fails, reveals nothing)", async () => {
    const blob = await encryptSecret("secret", "correct horse");
    expect(await decryptSecret(blob, "wrong horse")).toBeNull();
  });

  it("uses a fresh salt and iv each call (no reuse)", async () => {
    const a = await encryptSecret("x", "k");
    const b = await encryptSecret("x", "k");
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/secrets/secretCrypto.test.ts`
Expected: FAIL — cannot resolve `@/atlas/secrets/secretCrypto`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/atlas/secrets/secretCrypto.ts
/**
 * Player-secret cryptography. ONE module used by both the build (Node 20+) and
 * the player browser, via Web Crypto (globalThis.crypto.subtle) so ciphertext
 * produced at build time decrypts in the browser with no tag-convention drift.
 *
 * Scheme (pinned by the spec): AES-256-GCM; key = PBKDF2-SHA256, 600,000
 * iterations; 16-byte random salt + 12-byte random IV per secret. The GCM auth
 * tag is appended to the ciphertext automatically by Web Crypto on both sides.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

export interface SecretBlob {
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64( AES-GCM ciphertext || 16-byte tag )
}

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(plaintext: string, passphrase: string): Promise<SecretBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(ct) };
}

/** Returns the plaintext, or null if the passphrase is wrong (GCM auth failure). */
export async function decryptSecret(blob: SecretBlob, passphrase: string): Promise<string | null> {
  try {
    const key = await deriveKey(passphrase, b64ToBytes(blob.salt));
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(blob.iv) },
      key,
      b64ToBytes(blob.ciphertext),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/secrets/secretCrypto.test.ts`
Expected: PASS (3 tests). 600k PBKDF2 iterations make this measurably slow — expected, not a failure.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/secrets/secretCrypto.ts src/test/secrets/secretCrypto.test.ts
git commit -m "feat(secrets): shared Web Crypto encrypt/decrypt module"
```

---

## Phase 1 — Types & frontmatter parsing

### Task 2: Add `PlayerSecret` + `secretId` to the schema

**Files:**
- Modify: `src/atlas/content/schema.ts` (Entity L154–181, MapPlacement L197–208)
- Test: `src/test/secrets/schema-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/schema-types.test.ts
import { describe, it, expect } from "vitest";
import type { PlayerSecret, Entity, MapPlacement } from "@/atlas/content/schema";

describe("schema secret types", () => {
  it("PlayerSecret has ciphertext-only fields", () => {
    const s: PlayerSecret = { id: "x", lockType: "password", salt: "a", iv: "b", ciphertext: "c" };
    const e: Pick<Entity, "secrets"> = { secrets: [s] };
    const p: Pick<MapPlacement, "secretId"> = { secretId: "x" };
    expect(e.secrets?.[0].lockType).toBe("password");
    expect(p.secretId).toBe("x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/secrets/schema-types.test.ts`
Expected: FAIL — `PlayerSecret` not exported / `secrets`/`secretId` not on the interfaces.

- [ ] **Step 3: Implement — add the interface + fields**

In `src/atlas/content/schema.ts`, add `PlayerSecret` immediately before the `Entity` interface (around L153):

```typescript
/** A secret shipped to the player build as ciphertext only (never plaintext). */
export interface PlayerSecret {
  id: string;                       // entity-scoped slug
  lockType: "password" | "character";
  teaser?: string;                  // ONLY for password type; intentionally public
  salt: string;                     // base64, 16 random bytes, unique per secret
  iv: string;                       // base64, 12 random bytes, unique per secret
  ciphertext: string;               // base64( AES-GCM ciphertext || 16-byte auth tag )
}
```

In the `Entity` interface, add after the `relationships?` field (around L180):

```typescript
  /** Encrypted secret blobs (ciphertext only; present when an entity has secrets). */
  secrets?: PlayerSecret[];
```

In the `MapPlacement` interface, add after the `pin?` field (around L207):

```typescript
  /** Optional reference to a secret on this entity (a slug, never a key). */
  secretId?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/secrets/schema-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/schema.ts src/test/secrets/schema-types.test.ts
git commit -m "feat(secrets): add PlayerSecret type + secretId placement field"
```

---

### Task 3: `AtlasSecretSpec` + `parseSecrets()` in the frontmatter parser

**Files:**
- Modify: `scripts/atlas/parseFrontmatter.ts` (AtlasPlacementSpec L5–13, AtlasFrontmatter L15–33, parseFrontmatter L44–84, parsePlacements ~L120)
- Test: `src/test/secrets/parseSecrets.test.ts`

**Pattern to mirror:** `parsePlacements()` / `parseRelationships()` (array-of-objects validation with `sourcePath`/index/`warnings` and a fail-safe). The visibility fail-safe at L70–81 is the model: invalid input warns + is dropped, never silently shipped.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/parseSecrets.test.ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../../scripts/atlas/parseFrontmatter";

function fm(yaml: string) {
  return parseFrontmatter(`---\n${yaml}\n---\nbody\n`, "test.md");
}

describe("parseSecrets", () => {
  it("parses a character secret and a password secret", () => {
    const r = fm(`atlas:
  secrets:
    - id: signet
      for: vesper
      reveal: "you know that ring"
    - id: ward
      password: "the tide remembers"
      teaser: "Only a fjordmark person knows this"
      reveal: "the ward answers to blood"`);
    expect(r.atlas.secrets).toHaveLength(2);
    expect(r.atlas.secrets![0]).toMatchObject({ id: "signet", for: "vesper", reveal: "you know that ring" });
    expect(r.atlas.secrets![1]).toMatchObject({ id: "ward", password: "the tide remembers", teaser: "Only a fjordmark person knows this" });
    expect(r.warnings).toHaveLength(0);
  });

  it("rejects a secret with both for and password", () => {
    const r = fm(`atlas:
  secrets:
    - id: bad
      for: vesper
      password: x
      reveal: y`);
    expect(r.atlas.secrets).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/both 'for' and 'password'/);
  });

  it("rejects a secret missing reveal, missing id, or with a duplicate id", () => {
    expect(fm(`atlas:\n  secrets:\n    - id: a\n      password: p`).warnings.join(" ")).toMatch(/missing required 'reveal'/);
    expect(fm(`atlas:\n  secrets:\n    - password: p\n      reveal: r`).warnings.join(" ")).toMatch(/missing required 'id'/);
    const dup = fm(`atlas:\n  secrets:\n    - id: a\n      password: p\n      reveal: r\n    - id: a\n      password: q\n      reveal: s`);
    expect(dup.atlas.secrets).toHaveLength(1);
    expect(dup.warnings.join(" ")).toMatch(/not unique/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/secrets/parseSecrets.test.ts`
Expected: FAIL — `atlas.secrets` is `undefined` (not parsed).

- [ ] **Step 3: Implement**

In `scripts/atlas/parseFrontmatter.ts`, add `secretId?` to `AtlasPlacementSpec` (after `pin?` ~L12):

```typescript
  /** Optional reference to a secret on this entity (a slug, never a key). */
  secretId?: string;
```

Add the spec interface before `AtlasFrontmatter` (~L14):

```typescript
export interface AtlasSecretSpec {
  id: string;
  for?: string;       // character name (mutually exclusive with password)
  password?: string;  // passphrase (mutually exclusive with for)
  teaser?: string;    // optional public hint (password secrets only)
  reveal: string;     // markdown to encrypt (required)
}
```

Add to the `AtlasFrontmatter` interface after `relationships?` (~L32):

```typescript
  secrets?: AtlasSecretSpec[];
```

Add the validator near `parsePlacements` (after `parseRelationships`, ~L226):

```typescript
function parseSecrets(v: unknown, sourcePath: string, warnings: string[]): AtlasSecretSpec[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    warnings.push(`${sourcePath}: atlas.secrets must be an array — ignored`);
    return undefined;
  }
  const out: AtlasSecretSpec[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    const s = v[i] as Record<string, unknown> | null;
    if (!s || typeof s !== "object") {
      warnings.push(`${sourcePath}: atlas.secrets[${i}] is not an object — skipped`);
      continue;
    }
    const id = typeof s.id === "string" ? s.id.trim() : "";
    if (!id) {
      warnings.push(`${sourcePath}: atlas.secrets[${i}] missing required 'id' — skipped`);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`${sourcePath}: atlas.secrets[${i}] id "${id}" is not unique within this entity — skipped`);
      continue;
    }
    const hasFor = typeof s.for === "string" && s.for.trim().length > 0;
    const hasPwd = typeof s.password === "string" && s.password.length > 0;
    if (hasFor && hasPwd) {
      warnings.push(`${sourcePath}: secret "${id}" has both 'for' and 'password' — exactly one required — skipped`);
      continue;
    }
    if (!hasFor && !hasPwd) {
      warnings.push(`${sourcePath}: secret "${id}" has neither 'for' nor 'password' — exactly one required — skipped`);
      continue;
    }
    const reveal = typeof s.reveal === "string" ? s.reveal : "";
    if (!reveal) {
      warnings.push(`${sourcePath}: secret "${id}" missing required 'reveal' text — skipped`);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      for: hasFor ? (s.for as string).trim() : undefined,
      password: hasPwd ? (s.password as string) : undefined,
      teaser: hasPwd && typeof s.teaser === "string" ? s.teaser : undefined,
      reveal,
    });
  }
  return out.length > 0 ? out : [];
}
```

Wire it into the `atlas` object inside `parseFrontmatter()` (after the `relationships:` line ~L66):

```typescript
    secrets: parseSecrets(atlasRaw.secrets, sourcePath, warnings),
```

Also add `secretId` to the `parsePlacements()` output object (the `out.push({...})` ~L120):

```typescript
      secretId: typeof p.secretId === "string" ? p.secretId : undefined,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/secrets/parseSecrets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/atlas/parseFrontmatter.ts src/test/secrets/parseSecrets.test.ts
git commit -m "feat(secrets): parse atlas.secrets + placement secretId from frontmatter"
```

---

## Phase 2 — Build pipeline (encrypt, emit, strip, warn, pin-filter)

### Task 4: `stripSecretMarkers` util + apply to search index and body

**Files:**
- Create: `scripts/atlas/stripSecretMarkers.ts`
- Modify: `scripts/build-atlas.ts` (body assignment ~L417–423; search-index ~L963–979)
- Test: `src/test/secrets/stripSecretMarkers.test.ts`

**Why:** the spec's real leak fix — the `excerpt` field is built from **raw** `entity.body` and never passes through `stripMdCore`, so `{{secret:id}}` would survive into the search index. Strip markers explicitly.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/stripSecretMarkers.test.ts
import { describe, it, expect } from "vitest";
import { stripSecretMarkers } from "../../../scripts/atlas/stripSecretMarkers";

describe("stripSecretMarkers", () => {
  it("removes {{secret:id}} markers and leaves surrounding text", () => {
    expect(stripSecretMarkers("He keeps ledgers. {{secret:signet}} The rest trusts him."))
      .toBe("He keeps ledgers.  The rest trusts him.");
  });
  it("removes multiple markers", () => {
    expect(stripSecretMarkers("a {{secret:x}} b {{secret:y}} c")).toBe("a  b  c");
  });
  it("leaves text with no markers untouched", () => {
    expect(stripSecretMarkers("nothing here")).toBe("nothing here");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/secrets/stripSecretMarkers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

```typescript
// scripts/atlas/stripSecretMarkers.ts
/** Removes {{secret:id}} reference markers from body text before it ships. */
export function stripSecretMarkers(s: string): string {
  return s.replace(/\{\{secret:[^}]+\}\}/g, "");
}
```

- [ ] **Step 4: Wire into the build.** In `scripts/build-atlas.ts`:

Import near the other `./atlas/*` imports (~L17):

```typescript
import { stripSecretMarkers } from "./atlas/stripSecretMarkers";
```

At the body assignment (~L422), strip markers from the body that ships (both builds, for consistency). Change:

```typescript
const noDm = flags.player ? noDmStripped : parsed.body;
```

to:

```typescript
const noDm = stripSecretMarkers(flags.player ? noDmStripped : parsed.body);
```

In the search-index build (~L972), change the `excerpt` line so the marker is gone before slicing:

```typescript
    excerpt: stripSecretMarkers(entity.body).replace(/\s+/g, " ").trim().slice(0, 240),
```

(The `body`/`bodyText` fields already derive from `entity.body`, which is now marker-stripped at assignment, so they need no further change. Confirm by reading the `searchIndex.map` block.)

- [ ] **Step 5: Run test + a quick build smoke**

Run: `npx vitest run src/test/secrets/stripSecretMarkers.test.ts`
Expected: PASS.
Run: `npm run atlas:build:player`
Expected: completes with exit 0 (no behavior change for vaults without secrets).

- [ ] **Step 6: Commit**

```bash
git add scripts/atlas/stripSecretMarkers.ts scripts/build-atlas.ts src/test/secrets/stripSecretMarkers.test.ts
git commit -m "feat(secrets): strip {{secret:id}} markers from shipped body + search excerpt"
```

---

### Task 5: Encrypt secrets at build time + emit `entity.secrets`

**Files:**
- Create: `scripts/atlas/buildSecrets.ts`
- Modify: `scripts/build-atlas.ts` (char-keys load after `loadWorldConfig` ~L278; capture raw specs in entity loop; async encrypt pass before writing atlas.json; unmatched-marker warnings; lockType map)
- Test: `src/test/secrets/buildSecrets.test.ts`

**Key facts:** `js-yaml` is already imported in `scripts/atlas/loadWorldConfig.ts` (copy that import). The keys file is `path.join(contentDir, "_dm", "character-keys.yaml")`, a `Record<string,string>` of character-name → key. It is read once, outside the entity walk, and used **only** as encryption input — never attached to an Entity.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/buildSecrets.test.ts
import { describe, it, expect } from "vitest";
import { buildEntitySecrets } from "../../../scripts/atlas/buildSecrets";
import { decryptSecret } from "@/atlas/secrets/secretCrypto";
import type { AtlasSecretSpec } from "../../../scripts/atlas/parseFrontmatter";

describe("buildEntitySecrets", () => {
  const keys = new Map<string, string>([["vesper", "vesper-key-123"]]);

  it("encrypts a password secret; result decrypts with the password, not without", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "ward", password: "the tide", reveal: "the ward answers", teaser: "hint" }];
    const { secrets, warnings } = await buildEntitySecrets("corven", specs, keys);
    expect(warnings).toHaveLength(0);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ id: "ward", lockType: "password", teaser: "hint" });
    expect(JSON.stringify(secrets[0]).includes("the ward answers")).toBe(false);
    expect(await decryptSecret(secrets[0], "the tide")).toBe("the ward answers");
    expect(await decryptSecret(secrets[0], "wrong")).toBeNull();
  });

  it("encrypts a character secret under that character's key", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "signet", for: "vesper", reveal: "you know the ring" }];
    const { secrets } = await buildEntitySecrets("corven", specs, keys);
    expect(secrets[0].lockType).toBe("character");
    expect(secrets[0].teaser).toBeUndefined();
    expect(await decryptSecret(secrets[0], "vesper-key-123")).toBe("you know the ring");
  });

  it("warns and skips a character secret whose key is missing", async () => {
    const specs: AtlasSecretSpec[] = [{ id: "x", for: "nobody", reveal: "r" }];
    const { secrets, warnings } = await buildEntitySecrets("corven", specs, keys);
    expect(secrets).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/no character key for "nobody"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/secrets/buildSecrets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the encrypt helper**

```typescript
// scripts/atlas/buildSecrets.ts
import { encryptSecret } from "../../src/atlas/secrets/secretCrypto";
import type { PlayerSecret } from "../../src/atlas/content/schema";
import type { AtlasSecretSpec } from "./parseFrontmatter";

export interface BuildSecretsResult {
  secrets: PlayerSecret[];
  warnings: string[];
}

/**
 * Encrypts an entity's authored secrets into ship-safe ciphertext blobs.
 * Character secrets are encrypted under the character's key from `charKeys`;
 * password secrets under their own passphrase. Plaintext/password/key are never
 * placed on the returned blobs.
 */
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
        warnings.push(`entity "${entityId}": secret "${spec.id}" — no character key for "${spec.for}" — skipped`);
        continue;
      }
      passphrase = key;
      lockType = "character";
    } else {
      passphrase = spec.password as string;
      lockType = "password";
      teaser = spec.teaser;
    }
    const blob = await encryptSecret(spec.reveal, passphrase);
    secrets.push({ id: spec.id, lockType, teaser, salt: blob.salt, iv: blob.iv, ciphertext: blob.ciphertext });
  }
  return { secrets, warnings };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npx vitest run src/test/secrets/buildSecrets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `scripts/build-atlas.ts`.**

(a) Import (near `./atlas/*` imports ~L17):

```typescript
import { buildEntitySecrets } from "./atlas/buildSecrets";
import yaml from "js-yaml"; // already used in loadWorldConfig.ts — copy that exact import form
```

(b) Load character keys once, right after `loadWorldConfig` (~L278). `contentDir` is the resolved content root used elsewhere in the build:

```typescript
const charKeys = new Map<string, string>();
try {
  const keysPath = path.join(contentDir, "_dm", "character-keys.yaml");
  const rawKeys = fs.readFileSync(keysPath, "utf8");
  const parsedKeys = yaml.load(rawKeys) as Record<string, unknown> | null;
  if (parsedKeys && typeof parsedKeys === "object") {
    for (const [name, key] of Object.entries(parsedKeys)) {
      if (typeof key === "string" && key.length > 0) charKeys.set(name, key);
    }
  }
} catch {
  // No keys file → character secrets simply can't be built (warned per-secret below).
}
```

(c) Declare the two accumulator maps before the entity loop (near other accumulators ~L340):

```typescript
const secretSpecsByEntity = new Map<string, import("./atlas/parseFrontmatter").AtlasSecretSpec[]>();
const secretLockType = new Map<string, "password" | "character">();
```

(d) In the entity loop, after each Entity literal is built and pushed to `pending` (~L474), capture the raw specs + emit unmatched-marker warnings + record lockType:

```typescript
const entitySpecs = parsed.atlas.secrets ?? [];
if (entitySpecs.length > 0) {
  secretSpecsByEntity.set(entity.id, entitySpecs);
  const markerIds = new Set([...parsed.body.matchAll(/\{\{secret:([^}]+)\}\}/g)].map((m) => m[1]));
  for (const s of entitySpecs) {
    if (!markerIds.has(s.id)) {
      warnings.push(`${rel} (entity "${entity.id}"): secret "${s.id}" has no {{secret:${s.id}}} marker in the body — it will only appear in the secrets tab`);
    }
    secretLockType.set(`${entity.id}::${s.id}`, s.for ? "character" : "password");
  }
}
```

(e) After the entity loop, before building `searchIndex`/writing `atlas.json`, run the async encrypt pass over `pending` (both builds — the DM build needs blobs so the editor preview renders sealed boxes):

```typescript
for (const { entity } of pending) {
  const specs = secretSpecsByEntity.get(entity.id);
  if (!specs || specs.length === 0) continue;
  const { secrets, warnings: secWarn } = await buildEntitySecrets(entity.id, specs, charKeys);
  if (secrets.length > 0) entity.secrets = secrets;
  for (const w of secWarn) warnings.push(w);
}
```

(Confirm `runBuildCore`/`runBuild` is `async`; the build already awaits file writes, so adding an `await` pass is safe. If it is not async, make it async and `await runBuild(...)` at the CLI entry ~L1099.)

- [ ] **Step 6: Build smoke test with a real secret.** Add a secret to a scratch entity in your vault (a `password` secret needs no keys file), then:

Run: `npm run atlas:build:player`
Then inspect `public/atlas/atlas.json`: find the entity, confirm it has `secrets: [{ id, lockType, salt, iv, ciphertext }]` and that **no** `reveal`/`password` text appears.
Expected: ciphertext present, plaintext absent.

- [ ] **Step 7: Commit**

```bash
git add scripts/atlas/buildSecrets.ts scripts/build-atlas.ts src/test/secrets/buildSecrets.test.ts
git commit -m "feat(secrets): encrypt authored secrets at build time, emit ciphertext blobs"
```

---

### Task 6: Filter character-secret pins from the player build

**Files:**
- Modify: `scripts/build-atlas.ts` (placement loop ~L650–680)
- Test: `src/test/secrets/pin-visibility.test.ts`

**Why:** placements are plain JSON (not sanitized HTML). A pin referencing a **character** secret must not ship to players, or it leaks the secret's location. Password-secret pins may stay (they're meant to be found).

- [ ] **Step 1: Write the failing test** (build a tiny fixture vault, run the player build, assert the character-secret pin is gone, the password-secret pin remains). Mirror the fixture+exec pattern in `src/test/safety-fortress.test.ts`. Author `writeVault` to match `src/test/fixtures/sentinel-vault` (the canonical minimal layout — copy its `atlas.config.json` + `world.yaml` shape):

```typescript
// src/test/secrets/pin-visibility.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IS_WIN = process.platform === "win32";
const BUILD = path.resolve("scripts/build-atlas.ts");
let root: string;

function writeVault(dir: string) {
  // Minimal vault: one map, two placed entities — one pin -> character secret
  // (atlas.placements[].secretId pointing to a `for:` secret) and one -> password
  // secret. Copy the sentinel-vault config/world shape; place both on the map.
}

beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "secret-pins-")); writeVault(root); });
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

it("player build omits character-secret pins, keeps password-secret pins", () => {
  const out = path.join(root, "out");
  execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", BUILD, "--player", "--config", path.join(root, "atlas.config.json"), "--out", out], { stdio: "pipe" });
  const atlas = JSON.parse(fs.readFileSync(path.join(out, "atlas.json"), "utf8"));
  const placedIds = new Set((atlas.placements ?? []).map((p: { entityId: string }) => p.entityId));
  expect(placedIds.has("password-place")).toBe(true);
  expect(placedIds.has("character-place")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/pin-visibility.test.ts`
Expected: FAIL — both pins currently ship.

- [ ] **Step 3: Implement the filter.** In the placement loop (`scripts/build-atlas.ts` ~L665, inside `for (const p of list)`, after the fog check), add:

```typescript
const secId = (p as { secretId?: string }).secretId;
if (flags.player && secId && secretLockType.get(`${entity.id}::${secId}`) === "character") {
  secretPlacementsExcluded += 1;
  continue;
}
```

And carry the reference onto the emitted placement (so a password-secret pin can open its box). In the `placements.push({...})` object, add:

```typescript
    secretId: secId,
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/pin-visibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-atlas.ts src/test/secrets/pin-visibility.test.ts
git commit -m "feat(secrets): omit character-secret pins from player build"
```

---

## Phase 3 — The safety scan (the seatbelt)

### Task 7: `check-player-secrets` scan + orchestrator registration

**Files:**
- Create: `scripts/check-player-secrets.ts`
- Modify: `scripts/atlas/publish-orchestrator.ts` (import ~L24; tasks ~L61)
- Test: `src/test/secrets/check-player-secrets.test.ts`

**Pattern to mirror:** `check-derived-secrets.ts` `run(opts): number` (exit `0` clean / `1` arg error / distinct code on a hit — use `13`), and `check-artifact-shape.ts` `checkStringField`. JSON via `fs.readFileSync` + `JSON.parse`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/check-player-secrets.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../../../scripts/check-player-secrets";

let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "cps-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function writeAtlas(entities: unknown, search: unknown = []) {
  fs.writeFileSync(path.join(dir, "atlas.json"), JSON.stringify({ entities, placements: [] }));
  fs.writeFileSync(path.join(dir, "search-index.json"), JSON.stringify(search));
}

describe("check-player-secrets", () => {
  it("passes on clean ciphertext-only secrets", () => {
    writeAtlas([{ id: "a", body: "x", secrets: [{ id: "s", lockType: "password", teaser: "hint", salt: "QUJD", iv: "QUJD", ciphertext: "QUJDREVG" }] }]);
    expect(run({ dir })).toBe(0);
  });

  it("fails if a secret blob carries a forbidden 'reveal' key", () => {
    writeAtlas([{ id: "a", body: "x", secrets: [{ id: "s", lockType: "password", reveal: "the truth", salt: "Q", iv: "Q", ciphertext: "Q" }] }]);
    expect(run({ dir })).toBe(13);
  });

  it("fails if a 'password' value appears anywhere in atlas.json", () => {
    writeAtlas([{ id: "a", body: "x", password: "the tide remembers" }]);
    expect(run({ dir })).toBe(13);
  });

  it("fails if a {{secret: marker survives into the search index", () => {
    writeAtlas([{ id: "a", body: "x" }], [{ id: "a", excerpt: "He keeps ledgers {{secret:signet}}" }]);
    expect(run({ dir })).toBe(13);
  });

  it("returns 0 when the dir does not exist (nothing to check)", () => {
    expect(run({ dir: path.join(dir, "nope") })).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/check-player-secrets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the scan**

```typescript
// scripts/check-player-secrets.ts
/**
 * Player-secrets leak scan. Fails the publish if any secret PLAINTEXT, passphrase,
 * character key, or unstripped {{secret:}} marker reaches the player artifacts.
 * Exit codes: 0 = clean, 1 = arg/IO error, 13 = leak found.
 */
import fs from "node:fs";
import path from "node:path";

export interface RunOpts { dir: string }

const ALLOWED_SECRET_KEYS = new Set(["id", "lockType", "teaser", "salt", "iv", "ciphertext"]);
const FORBIDDEN_KEYS = new Set(["reveal", "password", "passphrase", "characterKey", "for"]);
const B64 = /^[A-Za-z0-9+/=]*$/;

interface Hit { where: string; detail: string }

function readJson(file: string): unknown | undefined {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return undefined; }
}

function scanForbiddenInString(value: unknown, where: string, hits: Hit[]) {
  if (typeof value !== "string") return;
  if (value.includes("{{secret:")) hits.push({ where, detail: "contains an unstripped {{secret:}} marker" });
}

function scanSecretBlob(blob: unknown, where: string, hits: Hit[]) {
  if (!blob || typeof blob !== "object") { hits.push({ where, detail: "secret blob is not an object" }); return; }
  const b = blob as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (FORBIDDEN_KEYS.has(k)) hits.push({ where, detail: `secret blob has forbidden key "${k}"` });
    else if (!ALLOWED_SECRET_KEYS.has(k)) hits.push({ where, detail: `secret blob has unexpected key "${k}"` });
  }
  for (const f of ["salt", "iv", "ciphertext"] as const) {
    if (typeof b[f] !== "string" || !B64.test(b[f] as string)) hits.push({ where, detail: `secret blob ${f} is not base64` });
  }
}

/** Deep walk: any object key in FORBIDDEN_KEYS anywhere is a leak. */
function walkForbiddenKeys(node: unknown, where: string, hits: Hit[]) {
  if (Array.isArray(node)) { node.forEach((n, i) => walkForbiddenKeys(n, `${where}[${i}]`, hits)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) hits.push({ where: `${where}.${k}`, detail: `forbidden key "${k}" present` });
      walkForbiddenKeys(v, `${where}.${k}`, hits);
    }
  }
}

export function run(opts: RunOpts): number {
  const target = path.resolve(process.cwd(), opts.dir);
  if (!fs.existsSync(target)) {
    console.log(`atlas:check-player-secrets: target "${opts.dir}" does not exist, skipping`);
    return 0;
  }
  const hits: Hit[] = [];

  const atlas = readJson(path.join(target, "atlas.json")) as { entities?: unknown[]; placements?: unknown[] } | undefined;
  if (atlas) {
    walkForbiddenKeys(atlas, "atlas", hits);
    for (const e of atlas.entities ?? []) {
      const ent = e as Record<string, unknown>;
      const id = typeof ent.id === "string" ? ent.id : "<unknown>";
      for (const f of ["body", "bodyHtml", "summary", "title", "excerpt"]) scanForbiddenInString(ent[f], `atlas.${id}.${f}`, hits);
      if (Array.isArray(ent.secrets)) ent.secrets.forEach((s, i) => scanSecretBlob(s, `atlas.${id}.secrets[${i}]`, hits));
    }
    for (const p of atlas.placements ?? []) {
      const pl = p as Record<string, unknown>;
      scanForbiddenInString(pl.label, `atlas.placement.${String(pl.id)}.label`, hits);
    }
  }

  const search = readJson(path.join(target, "search-index.json"));
  if (Array.isArray(search)) {
    for (const r of search) {
      const rec = r as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : "<unknown>";
      for (const f of ["excerpt", "body", "bodyText", "summary", "title"]) scanForbiddenInString(rec[f], `search.${id}.${f}`, hits);
    }
  }

  if (hits.length === 0) { console.log(`atlas:check-player-secrets: clean (${opts.dir})`); return 0; }
  console.error(`atlas:check-player-secrets: ${hits.length} leak(s) in ${opts.dir}:`);
  for (const h of hits) console.error(`  LEAK ${h.where} :: ${h.detail}`);
  return 13;
}

if (process.argv[1] && process.argv[1].endsWith("check-player-secrets.ts")) {
  const dirArg = process.argv[2] ?? "public/atlas";
  process.exit(run({ dir: dirArg }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/check-player-secrets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Register in the publish orchestrator.** In `scripts/atlas/publish-orchestrator.ts`, add the import (~L24):

```typescript
import { run as checkPlayerSecrets } from "../check-player-secrets.js";
```

Add two tasks to the `tasks` array (after the last entry ~L61):

```typescript
  { label: "check-player-secrets dist",         fn: () => checkPlayerSecrets({ dir: "dist" }) },
  { label: "check-player-secrets public/atlas",  fn: () => checkPlayerSecrets({ dir: "public/atlas" }) },
```

- [ ] **Step 6: Verify the full publish gate still passes on the real vault**

Run: `npm run atlas:publish`
Expected: exit 0; output lists `check-player-secrets dist` and `check-player-secrets public/atlas` among the clean scans.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-player-secrets.ts scripts/atlas/publish-orchestrator.ts src/test/secrets/check-player-secrets.test.ts
git commit -m "feat(secrets): add check-player-secrets leak scan to the publish gate"
```

---

### Task 8: End-to-end leak self-test (the seatbelt is itself tested)

**Files:**
- Test: `src/test/secrets/secrets-fortress.test.ts`

**Why:** the spec requires a fixture that plants plaintext + passphrase and asserts the **build + scan** fails. Mirror `src/test/safety-fortress.test.ts`.

- [ ] **Step 1: Write the test** — build a fixture vault containing a real secret (a `password` secret + a `character` secret with a keys file), run `--player`, then `check-player-secrets`; assert clean. Then write a deliberately-broken artifact (plaintext `reveal` planted) and assert the scan returns 13.

```typescript
// src/test/secrets/secrets-fortress.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run as checkPlayerSecrets } from "../../../scripts/check-player-secrets";

const IS_WIN = process.platform === "win32";
const BUILD = path.resolve("scripts/build-atlas.ts");
let root: string;

beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-fortress-")); /* writeVault(root): one password + one character secret + content/<world>/_dm/character-keys.yaml */ });
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

it("clean player build of a secret vault passes the leak scan", () => {
  const out = path.join(root, "out");
  execFileSync(IS_WIN ? "npx.cmd" : "npx", ["tsx", BUILD, "--player", "--config", path.join(root, "atlas.config.json"), "--out", out], { stdio: "pipe" });
  expect(checkPlayerSecrets({ dir: out })).toBe(0);
  const text = fs.readFileSync(path.join(out, "atlas.json"), "utf8");
  expect(text.includes("the ward answers")).toBe(false); // plaintext reveal must be absent
});

it("scan catches a planted plaintext leak", () => {
  const bad = path.join(root, "bad");
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, "atlas.json"), JSON.stringify({ entities: [{ id: "x", body: "x", secrets: [{ id: "s", lockType: "password", reveal: "the ward answers", salt: "Q", iv: "Q", ciphertext: "Q" }] }] }));
  fs.writeFileSync(path.join(bad, "search-index.json"), JSON.stringify([]));
  expect(checkPlayerSecrets({ dir: bad })).toBe(13);
});
```

- [ ] **Step 2: Run to verify behavior**

Run: `npx vitest run src/test/secrets/secrets-fortress.test.ts`
Expected: PASS (clean build passes, planted leak fails).

- [ ] **Step 3: Commit**

```bash
git add src/test/secrets/secrets-fortress.test.ts
git commit -m "test(secrets): end-to-end build + leak-scan fortress test"
```

---

## Phase 4 — Player-side render

### Task 9: Allow `data-secret-id` through the sanitizer

**Files:**
- Modify: `src/atlas/sanitizeHtml.ts` (ALLOWED_ATTR L46–54)
- Test: `src/test/secrets/sanitize-secret-attr.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/sanitize-secret-attr.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeAtlasHtml } from "@/atlas/sanitizeHtml";

it("keeps data-secret-id on a span", () => {
  const out = sanitizeAtlasHtml('<span data-secret-id="signet"></span>');
  expect(out).toContain('data-secret-id="signet"');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/sanitize-secret-attr.test.ts`
Expected: FAIL — DOMPurify strips the attribute.

- [ ] **Step 3: Implement.** In `src/atlas/sanitizeHtml.ts`, add to `ALLOWED_ATTR` (after `"data-callout",` ~L51):

```typescript
  "data-secret-id", "data-lock-type",
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/sanitize-secret-attr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/sanitizeHtml.ts src/test/secrets/sanitize-secret-attr.test.ts
git commit -m "feat(secrets): allow data-secret-id through the HTML sanitizer"
```

---

### Task 10: Substitute `{{secret:id}}` → placeholder span in the player projection

**Files:**
- Modify: `src/atlas/content/projectEntityForPlayer.ts` (pipeline L79–108)
- Test: `src/test/secrets/projection-marker.test.ts`

**Where:** insert before `tokenizeWikilinks` (the marker must survive markdown rendering as raw HTML). The placeholder carries only `data-secret-id` (the client resolves the blob, incl. lockType, from `entity.secrets`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/projection-marker.test.ts
import { describe, it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

function entity(body: string, secrets: Entity["secrets"]): Entity {
  return { id: "corven", title: "Corven", type: "npc", visibility: "player", aliases: [], tags: [], images: [], body, bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [], secrets } as Entity;
}

it("replaces a {{secret:id}} marker with a placeholder span carrying the id", () => {
  const e = entity("Ledgers. {{secret:signet}} Done.", [{ id: "signet", lockType: "character", salt: "Q", iv: "Q", ciphertext: "Q" }]);
  const ctx = buildProjectionContext(new Map([[e.id, e]]));
  const out = projectEntityForPlayer(e, ctx);
  expect(out.bodyHtml).toContain('data-secret-id="signet"');
  expect(out.bodyHtml).not.toContain("{{secret:");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/projection-marker.test.ts`
Expected: FAIL — marker passes through / span absent.

- [ ] **Step 3: Implement.** In `src/atlas/content/projectEntityForPlayer.ts`, after `const bodyForHtml = resolveImageEmbeds(body);` (~L85) and **before** `tokenizeWikilinks` (~L88), add:

```typescript
  // Secret markers: replace {{secret:id}} with an inert placeholder span. The
  // client (EntityPanel effect) resolves the matching entity.secrets blob and
  // renders the sealed/teaser UI or, for a character secret, the owner's reveal.
  const knownSecretIds = new Set((entity.secrets ?? []).map((s) => s.id));
  const bodyWithSecrets = bodyForHtml.replace(/\{\{secret:([^}]+)\}\}/g, (_m, rawId) => {
    const id = String(rawId).trim();
    if (!knownSecretIds.has(id)) return ""; // orphan marker → nothing
    const esc = id.replace(/"/g, "&quot;");
    return `<span class="atlas-secret-block" data-secret-id="${esc}"></span>`;
  });
```

Then change the `tokenizeWikilinks` call to consume `bodyWithSecrets` instead of `bodyForHtml`:

```typescript
  const { tokenized, links } = tokenizeWikilinks(bodyWithSecrets, { resolveByName: ctx.resolveByName });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/projection-marker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/content/projectEntityForPlayer.ts src/test/secrets/projection-marker.test.ts
git commit -m "feat(secrets): render secret markers as placeholder spans in player projection"
```

---

### Task 11: Unlock-state store (localStorage)

**Files:**
- Create: `src/atlas/secrets/playerSecretsStore.ts`
- Test: `src/test/secrets/playerSecretsStore.test.ts`

**Mirror:** `src/atlas/notes/playerNotes.ts` exactly (key + `getStorage()` probe + try/catch + JSON-shape validation). Stores (a) the active character key, (b) the set of unlocked password-secret ids.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/playerSecretsStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { setCharacterKey, getCharacterKey, markUnlocked, isUnlocked, forgetAll, _resetForTests } from "@/atlas/secrets/playerSecretsStore";

beforeEach(() => _resetForTests());

it("persists the character key and unlocked ids", () => {
  expect(getCharacterKey()).toBeNull();
  setCharacterKey("vesper-key");
  expect(getCharacterKey()).toBe("vesper-key");
  expect(isUnlocked("ward")).toBe(false);
  markUnlocked("ward");
  expect(isUnlocked("ward")).toBe(true);
});

it("forgetAll clears everything", () => {
  setCharacterKey("k"); markUnlocked("a"); forgetAll();
  expect(getCharacterKey()).toBeNull();
  expect(isUnlocked("a")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/playerSecretsStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (mirrors `playerNotes.ts` storage pattern):

```typescript
// src/atlas/secrets/playerSecretsStore.ts
/**
 * Player-local secret-unlock state — browser-only, never uploaded. Holds the
 * active character key (the player's own key, on their own device) and the set
 * of unlocked password-secret ids. Mirrors notes/playerNotes.ts storage rules.
 */
const STORAGE_KEY = "atlas-unlocked-secrets-v1";

interface SecretState { characterKey: string | null; unlocked: string[] }

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "__atlas_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function load(): SecretState {
  const s = getStorage();
  if (!s) return { characterKey: null, unlocked: [] };
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return { characterKey: null, unlocked: [] };
    const p = JSON.parse(raw);
    return {
      characterKey: typeof p?.characterKey === "string" ? p.characterKey : null,
      unlocked: Array.isArray(p?.unlocked) ? p.unlocked.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return { characterKey: null, unlocked: [] };
  }
}

function save(state: SecretState): void {
  const s = getStorage();
  if (!s) return;
  try { s.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota — ignore */ }
}

export function getCharacterKey(): string | null { return load().characterKey; }
export function setCharacterKey(key: string | null): void { const st = load(); st.characterKey = key; save(st); }
export function isUnlocked(secretId: string): boolean { return load().unlocked.includes(secretId); }
export function markUnlocked(secretId: string): void {
  const st = load();
  if (!st.unlocked.includes(secretId)) { st.unlocked.push(secretId); save(st); }
}
export function forgetAll(): void { save({ characterKey: null, unlocked: [] }); }
export function _resetForTests(): void { const s = getStorage(); try { s?.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/playerSecretsStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/secrets/playerSecretsStore.ts src/test/secrets/playerSecretsStore.test.ts
git commit -m "feat(secrets): localStorage unlock-state store"
```

---

### Task 12: Reveal controller (pure logic) + a `SecretBlock` imperative renderer

**Files:**
- Create: `src/atlas/secrets/revealSecret.ts` (pure: decrypt + re-sanitize)
- Create: `src/atlas/secrets/secretBlockView.ts` (DOM render for a placeholder)
- Test: `src/test/secrets/revealSecret.test.ts`

- [ ] **Step 1: Write the failing test (pure logic)**

```typescript
// src/test/secrets/revealSecret.test.ts
import { describe, it, expect } from "vitest";
import { encryptSecret } from "@/atlas/secrets/secretCrypto";
import { revealToHtml } from "@/atlas/secrets/revealSecret";
import type { PlayerSecret } from "@/atlas/content/schema";

it("decrypts and renders revealed markdown as sanitized HTML", async () => {
  const blob = await encryptSecret("**bold** and a [link](https://x.test)", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  const html = await revealToHtml(secret, "k");
  expect(html).not.toBeNull();
  expect(html!).toContain("<strong>bold</strong>");
});

it("returns null on a wrong passphrase", async () => {
  const blob = await encryptSecret("x", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  expect(await revealToHtml(secret, "wrong")).toBeNull();
});

it("neutralizes a script tag in a decrypted reveal", async () => {
  const blob = await encryptSecret("<scr" + "ipt>alert(1)</scr" + "ipt>safe", "k");
  const secret: PlayerSecret = { id: "s", lockType: "password", ...blob };
  const html = await revealToHtml(secret, "k");
  expect(html!.toLowerCase()).not.toContain("<scr" + "ipt");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/revealSecret.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure controller**

```typescript
// src/atlas/secrets/revealSecret.ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/revealSecret.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the DOM view** (exercised via the panel; keep it thin). The revealed HTML is already sanitized by `revealToHtml`; it is parsed into DOM nodes via `createContextualFragment` and the teaser is inserted as a text node:

```typescript
// src/atlas/secrets/secretBlockView.ts
import type { PlayerSecret } from "@/atlas/content/schema";
import { revealToHtml } from "./revealSecret";
import { getCharacterKey, markUnlocked } from "./playerSecretsStore";

function injectSafe(host: HTMLElement, safeHtml: string): void {
  const frag = document.createRange().createContextualFragment(safeHtml); // safeHtml = sanitizeAtlasHtml output
  host.replaceChildren(frag);
}

/**
 * Renders one placeholder <span data-secret-id> into either a sealed box
 * (password) or the owner's reveal (character).
 */
export function mountSecretBlock(host: HTMLElement, secret: PlayerSecret): void {
  host.replaceChildren();
  host.classList.add("atlas-secret");

  const showReveal = (safeHtml: string) => {
    const open = document.createElement("div");
    open.className = "atlas-secret-open";
    injectSafe(open, safeHtml);
    host.replaceChildren(open);
  };

  if (secret.lockType === "character") {
    const key = getCharacterKey();
    if (!key) { host.replaceChildren(); return; } // invisible until the owner signs in
    void revealToHtml(secret, key).then((html) => { if (html) showReveal(html); else host.replaceChildren(); });
    return;
  }

  // password: a visible sealed box with teaser + input
  const box = document.createElement("div");
  box.className = "atlas-secret-sealed";
  if (secret.teaser) {
    const t = document.createElement("div");
    t.className = "atlas-secret-teaser";
    t.textContent = secret.teaser; // text node — no HTML parsing
    box.appendChild(t);
  }
  const form = document.createElement("form");
  form.className = "atlas-secret-form";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "atlas-secret-input";
  input.placeholder = "Speak the words…";
  input.setAttribute("aria-label", "Secret passphrase");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Unseal";
  const msg = document.createElement("div");
  msg.className = "atlas-secret-msg";
  msg.setAttribute("role", "status");
  form.append(input, submit);
  box.append(form, msg);
  host.replaceChildren(box);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void revealToHtml(secret, input.value).then((html) => {
      if (html) { markUnlocked(secret.id); showReveal(html); }
      else { msg.textContent = "The seal holds firm."; }
    });
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/atlas/secrets/revealSecret.ts src/atlas/secrets/secretBlockView.ts src/test/secrets/revealSecret.test.ts
git commit -m "feat(secrets): reveal controller (decrypt + re-sanitize) and sealed-box view"
```

---

### Task 13: Wire `SecretBlock` mounting into `EntityPanel`

**Files:**
- Modify: `src/atlas/entity/EntityPanel.tsx` (the body-rendering div at L319; the panel `forwardRef` at L224)
- Modify: `src/index.css` (secret styles)
- Test: manual (component; verified in-app)

**Pattern to mirror:** the wikilink click effect in `src/pages/AtlasViewer.tsx` L301–316 — a `useEffect` over the body `ref` that post-processes rendered nodes.

- [ ] **Step 1: Add the effect.** In `src/atlas/entity/EntityPanel.tsx`, near the existing body `ref`, add:

```typescript
import { mountSecretBlock } from "@/atlas/secrets/secretBlockView";
// ...
useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const nodes = el.querySelectorAll<HTMLElement>("[data-secret-id]");
  const byId = new Map((entity.secrets ?? []).map((s) => [s.id, s]));
  nodes.forEach((node) => {
    const id = node.getAttribute("data-secret-id");
    const secret = id ? byId.get(id) : undefined;
    if (secret) mountSecretBlock(node, secret);
  });
}, [entity.id, entity.bodyHtml, entity.secrets]);
```

(Use the same `ref` already attached to the body div at L319. If `EntityPanel` is a `forwardRef` that doesn't keep a local body ref, add `const bodyRef = useRef<HTMLDivElement>(null)`, attach it to the body div alongside any forwarded ref, and query through `bodyRef` — mirroring how `AtlasViewer.tsx` owns `panelRef`.)

- [ ] **Step 2: Add minimal styles** for `.atlas-secret-sealed`, `.atlas-secret-teaser`, `.atlas-secret-open`, `.atlas-secret-form`, `.atlas-secret-msg` in `src/index.css`, following the existing `.atlas-*` conventions. Sealed box: bordered, left-accent; open: subtle "unsealed" treatment; gate any transition behind `prefers-reduced-motion` (mirror the ocean's reduced-motion guard).

- [ ] **Step 3: Verify in the running app** (preview workflow): `npm run dev`, open an entity that has a password secret, confirm the sealed box renders, a wrong phrase shows "The seal holds firm," and the correct phrase reveals formatted text. Confirm the player-preview projection shows it sealed.

- [ ] **Step 4: Commit**

```bash
git add src/atlas/entity/EntityPanel.tsx src/index.css
git commit -m "feat(secrets): mount sealed-box reveals into the entity reading pane"
```

---

## Phase 5 — The "Your character's secrets" tab

### Task 14: Aggregate a character's secrets across the atlas

**Files:**
- Create: `src/atlas/secrets/collectCharacterSecrets.ts`
- Test: `src/test/secrets/collectCharacterSecrets.test.ts`

**Logic:** given the loaded atlas entities and a character key, try-decrypt every `lockType: "character"` blob; those that decrypt belong to that character.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/collectCharacterSecrets.test.ts
import { describe, it, expect } from "vitest";
import { encryptSecret } from "@/atlas/secrets/secretCrypto";
import { collectCharacterSecrets } from "@/atlas/secrets/collectCharacterSecrets";
import type { Entity } from "@/atlas/content/schema";

it("returns only the secrets the key decrypts", async () => {
  const mine = await encryptSecret("you buried it at the keep", "vesper-key");
  const theirs = await encryptSecret("not yours", "other-key");
  const entities: Entity[] = [
    { id: "keep", title: "The Keep", secrets: [{ id: "a", lockType: "character", ...mine }] } as Entity,
    { id: "x", title: "X", secrets: [{ id: "b", lockType: "character", ...theirs }] } as Entity,
  ];
  const found = await collectCharacterSecrets(entities, "vesper-key");
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({ entityId: "keep", entityTitle: "The Keep" });
  expect(found[0].html).toContain("buried");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/collectCharacterSecrets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/atlas/secrets/collectCharacterSecrets.ts
import type { Entity } from "@/atlas/content/schema";
import { revealToHtml } from "./revealSecret";

export interface CollectedSecret { entityId: string; entityTitle: string; secretId: string; html: string }

/** Try the character key against every character-lock blob; return those it opens. */
export async function collectCharacterSecrets(entities: Entity[], characterKey: string): Promise<CollectedSecret[]> {
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/collectCharacterSecrets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/secrets/collectCharacterSecrets.ts src/test/secrets/collectCharacterSecrets.test.ts
git commit -m "feat(secrets): collect a character's secrets across the atlas by key"
```

---

### Task 15: The secrets tab page + always-visible nav entry

**Files:**
- Create: `src/atlas/secrets/CharacterSecretsPage.tsx`
- Modify: the player route table + nav (the player route list in `src/App.tsx` and the player nav menu). This page is **player-facing** — it must NOT be gated by `__INCLUDE_EDITOR__`.
- Test: manual (component)

**Decision (resolved):** the page is **always visible** in the player nav.

- [ ] **Step 1: Build the page component.** It renders already-sanitized reveal HTML through a small ref-based `SafeHtml` helper that parses the sanitized string into DOM nodes via `createContextualFragment`:

```typescript
// src/atlas/secrets/CharacterSecretsPage.tsx
import { useEffect, useRef, useState } from "react";
import type { Entity } from "@/atlas/content/schema";
import { collectCharacterSecrets, type CollectedSecret } from "./collectCharacterSecrets";
import { getCharacterKey, setCharacterKey, forgetAll } from "./playerSecretsStore";

function SafeHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.replaceChildren(document.createRange().createContextualFragment(html)); // html = sanitizeAtlasHtml output
  }, [html]);
  return <div ref={ref} />;
}

export function CharacterSecretsPage({ entities }: { entities: Entity[] }) {
  const [key, setKey] = useState<string | null>(() => getCharacterKey());
  const [found, setFound] = useState<CollectedSecret[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!key) { setFound([]); return; }
    let alive = true;
    void collectCharacterSecrets(entities, key).then((r) => { if (alive) { setFound(r); setTried(true); } });
    return () => { alive = false; };
  }, [key, entities]);

  const onSignIn = (value: string) => { setCharacterKey(value); setKey(value); };
  const onForget = () => { forgetAll(); setKey(null); setFound([]); setTried(false); };

  if (!key) {
    return (
      <section className="atlas-secrets-page">
        <h1>Your character's secrets</h1>
        <p>Enter the key your DM gave you to see what only your character knows.</p>
        <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("k") as HTMLInputElement).value; if (v) onSignIn(v); }}>
          <input name="k" type="text" aria-label="Your character key" placeholder="Your character key" />
          <button type="submit">Sign in</button>
        </form>
      </section>
    );
  }

  return (
    <section className="atlas-secrets-page">
      <h1>Your character's secrets</h1>
      <button onClick={onForget}>Forget on this device</button>
      {tried && found.length === 0 && <p>No secrets found for that key. Check it with your DM.</p>}
      <ul>
        {found.map((s) => (
          <li key={`${s.entityId}:${s.secretId}`}>
            <SafeHtml html={s.html} />
            <a href={`#/entity/${encodeURIComponent(s.entityId)}`}>On: {s.entityTitle}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Register the route + nav item** in the player app (NOT behind `__INCLUDE_EDITOR__`). Add a route `#/secrets` rendering `<CharacterSecretsPage entities={allEntities} />`, and an always-visible nav link "Your character's secrets". Follow the existing player-route registration in `src/App.tsx` and the player nav component.

- [ ] **Step 3: Verify in-app**

Run: `npm run dev`, open `#/secrets`, sign in with a key from the keys file, confirm only that character's secrets appear; "Forget" clears it.

- [ ] **Step 4: Commit**

```bash
git add src/atlas/secrets/CharacterSecretsPage.tsx src/App.tsx
git commit -m "feat(secrets): your-character's-secrets tab (always visible)"
```

---

## Phase 6 — DM editor surfaces (gated by `__INCLUDE_EDITOR__`)

### Task 16: Extend the save allowlist for the DM keys file

**Files:**
- Modify: `src/atlas/save/sourcePathAllowlist.ts` (`isWritableSourcePath` L36–69)
- Test: `src/test/secrets/keys-allowlist.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/secrets/keys-allowlist.test.ts
import { describe, it, expect } from "vitest";
import { isWritableSourcePath } from "@/atlas/save/sourcePathAllowlist";

it("permits the single fixed DM keys file but not other _dm writes", () => {
  expect(isWritableSourcePath("content/world/_dm/character-keys.yaml")).toBe(true);
  expect(isWritableSourcePath("content/world/_dm/other.yaml")).toBe(false);
  expect(isWritableSourcePath("content/world/_dm/notes.md")).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/keys-allowlist.test.ts`
Expected: FAIL — `_dm` paths are rejected.

- [ ] **Step 3: Implement.** In `src/atlas/save/sourcePathAllowlist.ts`, inside `isWritableSourcePath`, after the `_atlas yaml/yml branch` block and before the `.md branch` (~L62), add:

```typescript
  // Single fixed DM-only keys file. The _dm folder stays build-excluded; only
  // this exact filename is writable, so it can never become a general _dm write.
  if (secondLast === "_dm" && last === "character-keys.yaml") {
    return parts.length >= 4; // content/<world>/_dm/character-keys.yaml
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/keys-allowlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/atlas/save/sourcePathAllowlist.ts src/test/secrets/keys-allowlist.test.ts
git commit -m "feat(secrets): allow saving the fixed DM character-keys file"
```

---

### Task 17: Character keys editor panel

**Files:**
- Create: `src/atlas/secrets/CharacterKeysPanel.tsx`
- Modify: `src/atlas/shell/railRegistry.tsx` (add `mk("characterKeys", "system", "Character Keys", <Key className={ICON} />)`); `src/pages/AtlasPlacementEditor.tsx` (add `characterKeys:` to the `panels` object)
- Test: manual (editor-only)

**Pattern:** mirror `MapSettingsPanel.tsx`. Persist via `saveAtlasPatchToLocalFs([{ path: "content/<world>/_dm/character-keys.yaml", content: <yaml>, kind: "world-yaml", baseHash }])`. The `<world>` path segment comes from the active project/world config the editor already holds.

- [ ] **Step 1: Build the panel** — rows of `{ character name, key }`, a **Generate key** button, **Copy** (clipboard + confirmation), and a help line: "share this with the player privately; if they lose it, this panel shows the same key again." On change, serialize `Record<name,key>` to YAML (`js-yaml` `dump`) and save through the channel with `rebuild: true`.

```typescript
// src/atlas/secrets/CharacterKeysPanel.tsx  (editor-only; imported solely from AtlasPlacementEditor)
import { useState } from "react";
import yaml from "js-yaml";
import { saveAtlasPatchToLocalFs, type FileChange } from "@/atlas/save/localFsSave";

interface Props { worldDir: string; initial: Record<string, string>; baseHash: string | null; }

export function CharacterKeysPanel({ worldDir, initial, baseHash }: Props) {
  const [rows, setRows] = useState<Record<string, string>>(initial);
  const persist = async (next: Record<string, string>) => {
    setRows(next);
    const change: FileChange = {
      path: `${worldDir}/_dm/character-keys.yaml`,
      content: yaml.dump(next),
      kind: "world-yaml",
      baseHash,
    };
    await saveAtlasPatchToLocalFs([change], undefined, { rebuild: true });
  };
  const generate = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(36)).join("");
  // Render: one row per character (name input + key display + Generate + Copy);
  // an "Add player" button; call persist() on edits. Mirror MapSettingsPanel layout/classes.
  return null; // replace with the row UI following MapSettingsPanel.tsx conventions
}
```

- [ ] **Step 2: Register** the panel in `railRegistry.tsx` and wire `characterKeys:` into the `panels` object in `AtlasPlacementEditor.tsx` (constructed only inside the already-`__INCLUDE_EDITOR__`-gated editor page, so it never ships to players).

- [ ] **Step 3: Verify in-app** — add a player + key, Save, confirm `content/<world>/_dm/character-keys.yaml` is written and that a subsequent player build encrypts that character's secrets under it.

- [ ] **Step 4: Commit**

```bash
git add src/atlas/secrets/CharacterKeysPanel.tsx src/atlas/shell/railRegistry.tsx src/pages/AtlasPlacementEditor.tsx
git commit -m "feat(secrets): DM character-keys editor panel"
```

---

### Task 18: Two "Add secret" buttons in the entity editor

**Files:**
- Modify: `src/atlas/editor/toolbarActions.ts` (`ToolbarActionId` union; `applyToolbarAction` L82–120)
- Modify: `src/atlas/categories/EntityEditPanel.tsx` (toolbar; the `onSave` frontmatter rebuild L112–143 to persist `atlas.secrets`)
- Test: `src/test/secrets/insert-secret-action.test.ts`

**Behavior:** each button (a) inserts a `{{secret:<auto-id>}}` marker at the cursor and (b) adds a ready-to-fill entry to `atlas.secrets` in the draft frontmatter. The DM fills the blanks; no hand-written YAML.

- [ ] **Step 1: Write the failing test (marker insertion is pure)**

```typescript
// src/test/secrets/insert-secret-action.test.ts
import { describe, it, expect } from "vitest";
import { applyToolbarAction } from "@/atlas/editor/toolbarActions";

it("inserts a {{secret:id}} marker at the cursor", () => {
  const r = applyToolbarAction("secret:character", "Before after", 6, 6);
  expect(r.value).toMatch(/\{\{secret:[a-z0-9-]+\}\}/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/test/secrets/insert-secret-action.test.ts`
Expected: FAIL — action id not handled.

- [ ] **Step 3: Implement the marker insertion.** Add to the `ToolbarActionId` union:

```typescript
  | "secret:character"
  | "secret:password"
```

Add cases in `applyToolbarAction` (mirror the existing `insertBlock` usage; `crypto.getRandomValues` is fine at editor runtime):

```typescript
    case "secret:character":
    case "secret:password": {
      const id = "s-" + Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(36)).join("");
      return insertBlock(value, selStart, `{{secret:${id}}}`);
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/test/secrets/insert-secret-action.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the frontmatter side.** In `EntityEditPanel.tsx`:
  - Add two toolbar buttons ("Add a character secret", "Add a puzzle secret"). On click: call the toolbar action to insert the marker, capture the generated id, and append a scaffold entry to a draft `secrets` array in editor state:
    - character: `{ id, for: "", reveal: "" }`
    - puzzle: `{ id, password: "", teaser: "", reveal: "" }`
  - In `onSave` (the frontmatter rebuild ~L130), include the draft secrets:

```typescript
const atlas: Record<string, unknown> = {
  ...((data.atlas as Record<string, unknown>) ?? {}),
  id: api.draft.fields.id,
  type: api.draft.fields.type,
  visibility: api.draft.fields.visibility,
};
if (api.draft.fields.secrets && api.draft.fields.secrets.length > 0) {
  atlas.secrets = api.draft.fields.secrets;
} else {
  delete atlas.secrets;
}
```

  - Provide a tiny inline form per draft secret (for: dropdown sourced from the keys file / reveal textarea / teaser) so the DM fills blanks. The "for" dropdown lists characters from `content/<world>/_dm/character-keys.yaml`.

- [ ] **Step 6: Verify in-app** — add a character secret + a puzzle secret to an entity via the buttons, fill the blanks, Save, rebuild, confirm both encrypt and render.

- [ ] **Step 7: Commit**

```bash
git add src/atlas/editor/toolbarActions.ts src/atlas/categories/EntityEditPanel.tsx src/test/secrets/insert-secret-action.test.ts
git commit -m "feat(secrets): two Add-secret buttons that scaffold frontmatter + marker"
```

---

### Task 19: Regression guard — player preview shows secrets sealed

**Files:**
- Test: `src/test/secrets/preview-sealed.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// src/test/secrets/preview-sealed.test.ts
import { it, expect } from "vitest";
import { projectEntityForPlayer, buildProjectionContext } from "@/atlas/content/projectEntityForPlayer";
import type { Entity } from "@/atlas/content/schema";

it("player projection seals secrets (placeholder only, no plaintext)", () => {
  const e = { id: "c", title: "C", type: "npc", visibility: "player", aliases: [], tags: [], images: [], body: "x {{secret:s}}", bodyHtml: "", frontmatter: {}, sourcePath: "", links: [], backlinks: [], secrets: [{ id: "s", lockType: "character", salt: "Q", iv: "Q", ciphertext: "Q" }] } as Entity;
  const out = projectEntityForPlayer(e, buildProjectionContext(new Map([[e.id, e]])));
  expect(out.bodyHtml).toContain('data-secret-id="s"');
  expect(out.bodyHtml).not.toContain("{{secret:");
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/test/secrets/preview-sealed.test.ts`
Expected: PASS (already implemented by Task 10 — this is the regression guard).

- [ ] **Step 3: Commit**

```bash
git add src/test/secrets/preview-sealed.test.ts
git commit -m "test(secrets): player preview renders secrets sealed"
```

---

## Final verification

- [ ] **Run the secrets test suite** (single directory, avoids OOM):

Run: `npx vitest run src/test/secrets/`
Expected: all green.

- [ ] **Run the full publish gate end-to-end** on the real vault (author at least one character secret and one puzzle secret):

Run: `npm run atlas:publish`
Expected: exit 0; `check-player-secrets` clean for both `dist` and `public/atlas`; manually confirm `public/atlas/atlas.json` and `public/atlas/search-index.json` contain ciphertext only — no `reveal`, `password`, character key, or `{{secret:` substring.

- [ ] **Run the type check / lint / build**

Run: `npm run build` and `npm run lint`
Expected: build succeeds (player bundle tree-shakes the editor panels via `__INCLUDE_EDITOR__`); lint shows only pre-existing warnings.

---

## Spec-coverage self-check (done while writing this plan)

- Two lock types → Tasks 3, 5 (build), 12–13 (render). ✓
- Visibility by type (character invisible to non-owners) → Task 12 view (renders empty without key), Task 6 (pin filter). ✓
- Inline + pin + tab surfaces → Tasks 10/13 (inline), 6 (pin ref), 14/15 (tab). ✓
- Real AES-256-GCM/PBKDF2, tag appended, Node↔browser interop → Task 1. ✓
- Ciphertext-only ship + plaintext stripped → Task 5 (emit); frontmatter zeroing is pre-existing. ✓
- Search-index marker leak fix → Task 4. ✓
- check-player-secrets over atlas.json AND search-index.json + self-test → Tasks 7, 8. ✓
- Re-sanitize decrypted reveals → Task 12. ✓
- Unmatched-marker build warning → Task 5(d). ✓
- DM keys file + allowlist + panel → Tasks 16, 17. ✓
- Two per-type Add-secret buttons (no hand YAML) → Task 18. ✓
- Resolved decisions: show-same-key (Task 17 help line), full markdown (Task 12 via markdownToHtml), tab always-visible (Task 15), nudge-only strength (Task 18 leaves password free-form). ✓
- DM build retains plaintext frontmatter; scan runs only on player dirs → Task 7 scans `dist`/`public/atlas` only. ✓
