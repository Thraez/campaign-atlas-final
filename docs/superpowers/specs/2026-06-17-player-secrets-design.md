# Player Secrets — design ("Sealed reveals" & character keys)

**Created:** 2026-06-17 · **Status:** approved direction (human brainstorm) · **Owner:** the DM
**Hardened:** 2026-06-17 against an adversarial spec review (red-team leak hunt, crypto, feasibility, scope, DM-UX).
**Related:** idea panel in `docs/DEVELOPMENT_WANTS.md` (2026-06-17 section) · secrecy model in `README.md`
("Where do your secrets live") · scan contracts under `scripts/`.

> **One-line:** the published player site can carry secret, character-specific content that ships as real
> encrypted ciphertext and reveals only when a player types the right passphrase or character key — with a
> build-time scan that fails publish if any plaintext, passphrase, or key ever leaks.

---

## North-star fit

Serves **"a richer world players enjoy"** without touching the spine: pure player-facing presentation over
content the DM already authors. **No server, no accounts, no backend** — does not cross the "hosted DM editor
with auth" or "server-backed player notes" non-goals. Tie-breaker (build smoother → share safer → explore
richer) is respected: authoring is a one-click editor action, sharing stays provably safe via a new scan,
exploring gets the new delight.

## What it is — the player experience

Two **lock types**, with on-page visibility decided automatically by the type (the DM never sets it per
secret):

| Lock type | For | Visible when locked? | Unlocked by |
|---|---|---|---|
| **Character key** | The backstory secrets a character owns from session zero | **No** — invisible to everyone except the owner; appears only once that player signs in as their character | A single per-character key, entered once |
| **Per-secret password** | Things discovered in play; in-world puzzles ("only a true fjordmark person knows this") | **Yes** — a visible sealed box anyone can see and attempt | A password specific to that one secret |

Both reveal in three places:

1. **Inline in an entity's prose** — a sealed box sits where the DM dropped a marker. A *password* secret shows
   a teaser line + a passphrase field. A *character* secret renders nothing for non-owners and reveals in place
   for the owner.
2. **On a pin** — a pin can carry a secret id; opening the pin surfaces the box (with the visibility rule
   below).
3. **The "Your character's secrets" tab** — one page that gathers everything a character knows. The player
   signs in once with their character key; every character-key secret across the atlas that their key unlocks
   is listed, plus any password puzzles they have cracked. A muted line teases how many remain sealed.

**Persistence:** a successful unlock is remembered on that device (mirrors the player-notes local-storage
pattern), with a **"forget on this device"** control. **Wrong input reveals nothing** — the real text was
never present until decryption.

## Authoring model (the DM's experience)

Canon stays in Obsidian markdown; secret *text never enters the page body*. Secrets are written in the note's
`atlas` frontmatter; a reference marker in the body marks where the box appears. An editor **"Insert secret"**
button writes both at once (auto-generating the id), so the DM never hand-types syntax.

```yaml
# in an entity's frontmatter
atlas:
  secrets:
    - id: corven-signet          # stable slug, unique within the entity
      for: vesper                # → character-key secret (encrypted under Vesper's key)
      reveal: |
        You've seen that onyx ring before — on the hand of the man
        who paid for your sister's silence.
    - id: brackenfjall-ward
      password: "the tide remembers"     # → per-secret password secret
      teaser: "Only a true Brackenfjall fjordmark person knows this"   # intentionally public
      reveal: |
        The old ward-stone answers only to fjordmark blood...
```

```markdown
<!-- in the body, where the box should appear -->
He keeps his ledgers close. {{secret:corven-signet}}
```

- `for:` and `password:` are **mutually exclusive**; `reveal:` is required; `id` must be unique within the
  entity. `parseSecrets()` validates this and the build warns on violations.
- A secret with **no** body marker still appears in the owner's secrets tab.
- A **pin** can reference a secret via a new optional `secretId` on its placement.
- **Character keys** are managed in a DM-only **"Character keys"** panel; each player's key is given to them
  out-of-band.

## Data model

**Prerequisite plumbing (does not exist today — `atlas.secrets` is currently parsed away and dropped):**
- Add `secrets?: PlayerSecret[]` to `Entity` (`src/atlas/content/schema.ts`, interface ~L154–181).
- Add `secrets?: AtlasSecretSpec[]` to `AtlasFrontmatter` (`scripts/atlas/parseFrontmatter.ts`, ~L15–33) and a
  validating `parseSecrets()` in that module.

A secret is emitted to the player build as a **ciphertext blob only**:

```ts
// shipped on the player entity as entity.secrets?: PlayerSecret[]
interface PlayerSecret {
  id: string;                       // entity-scoped slug
  lockType: "password" | "character";
  teaser?: string;                  // ONLY for password type; intentionally public
  salt: string;                     // base64, 16 random bytes, unique per secret
  iv: string;                       // base64, 12 random bytes, unique per secret
  ciphertext: string;               // base64( AES-GCM ciphertext || 16-byte auth tag )
}
```

- **Owner name is not emitted** for character secrets — the key is the selector (trial-decrypt), so there is
  no "this belongs to Vesper" meta-leak.
- `reveal`, `password`, `for`, and any character key **never appear in the player build**.
- Body marker `{{secret:id}}` becomes a placeholder element carrying only the id; the literal marker is
  stripped from every search-index field (see below).
- Pin gains optional `secretId?: string` (a reference, never a key).

## Security model & guarantees

**Pinned crypto (must be implemented exactly so Node-build and browser-decrypt interoperate):**

- **AES-256-GCM.**
- Key derived by **PBKDF2-SHA256, 600,000 iterations**, 256-bit derived key, from the passphrase/character
  key + a **16-byte random salt** (unique per secret).
- **12-byte random IV** per secret; never reused under a key.
- **`ciphertext` field = `base64( GCM ciphertext ‖ 16-byte auth tag )`** — the tag is **appended**, not a
  separate field. (Node's `crypto` exposes the tag via `getAuthTag()`; Web Crypto appends it automatically.
  The build must append Node's tag to match what the browser expects.)
- Same scheme in Node (build-time `encrypt()`) and browser (`decrypt()` via Web Crypto). **No third-party
  crypto dependency.** Shipped with **shared Node↔browser test vectors** proving round-trip.
- **Decrypt-latency budget:** target < ~300 ms on a 2020-era phone; tune the iteration count against that
  measured budget if 600k is too slow on real devices.

**Only ciphertext + salt + iv ship.** A player who inspects every published file finds only noise unless they
hold the secret. Plaintext is kept out of the body entirely (authored in frontmatter, which the build zeroes
for players), so it cannot leak through `atlas.json` **or** the search index.

**New safety scan — `scripts/check-player-secrets.ts`** (the seatbelt, non-negotiable). A module exporting
`run({ dir })` returning 0/non-zero, matching the existing `check-*` pattern, added to the
`scripts/atlas/publish-orchestrator.ts` task array for **both `dist` and `public/atlas`**. The orchestrator
collapses any non-zero task to overall exit 1 (per-scan codes are informational). It asserts:

- In **`atlas.json`**: scan every entity text field (`body`, `bodyHtml`, `summary`, `title`, `aliases`,
  `tags`, `relationships[].label/description`, `profile.player.*`); every `entity.secrets[]` blob carries
  **only** `id`/`lockType`/`teaser`/`salt`/`iv`/`ciphertext` keys, each blob is base64-shaped, and the keys OR
  values `reveal`/`password`/`passphrase`/`for`/`characterKey` appear **nowhere**; scan all
  `MapPlacement.label` and `secretId`.
- In **`search-index.json`**: scan `excerpt`, `body`, and `bodyText` (the existing `check-artifact-shape` does
  **not** cover the search index).
- The literal substring **`{{secret:`** must appear **nowhere** in either artifact.
- **Self-test fixture:** a fixture planting known plaintext + passphrase must make the scan **fail the build**;
  a clean fixture passes.

**Residual risks (carried, not hidden):**
- Real encryption is only as strong as the passphrase. A weak/shared phrase can be guessed offline (PBKDF2 cost
  slows it) or passed around. Mitigation: UX nudges strong multi-word phrases; campaign-breakers use a strong
  password; character-key backstory secrets are safe because the key reaches only one player.
- Once unlocked, the text is cached on that device (by design). "Forget on this device" clears it.
- **Key rotation:** changing a character key requires a rebuild to re-encrypt; old keys stop working and the
  player must be re-told. (Optional `keyVersion` could allow overlap during a transition — deferred.)
- **The DM build (`.local-atlas`) legitimately keeps full plaintext** in frontmatter (frontmatter is only
  zeroed when `flags.player`). Therefore the scan runs **only against player output dirs**, and DM artifacts
  must never be published.

## Build-pipeline integration (corrected seams)

- **Frontmatter parse:** `parseSecrets()` in `scripts/atlas/parseFrontmatter.ts`; read alongside the other
  `atlas.*` fields in `scripts/build-atlas.ts` (~L461).
- **Character-key resolution (explicit, deliberate read):** `build-atlas.ts` loads the fixed DM keys file
  `content/_dm/character-keys.yaml` **once, outside the entity walk**, into a `name→key` Map used **solely as
  encryption input**. Keys never enter any `Entity` or shipped field. This read runs in **both** DM and player
  builds (the player build needs it to encrypt). Note `content/_dm/**` is a folder exclude in
  `atlas.config.json`, so the file is otherwise never read as an entity.
- **Encrypt-and-emit:** in the player branch, for each secret resolve its key (per-secret `password`, or the
  character key via `for:`), encrypt `reveal`, emit `entity.secrets` ciphertext blobs, drop plaintext fields.
- **Inline marker (resolved fork):** do a **pre-render substitution in
  `src/atlas/content/projectEntityForPlayer.ts`** — replace `{{secret:id}}` with a placeholder
  `<span data-secret-id="id" data-lock-type="…">` before HTML build. **Do NOT register a marked extension** —
  `markdownCore.ts` is the single shared renderer and its header states secrecy is handled by the caller.
- **Sanitizer allowlist:** add `data-secret-id` (and `data-lock-type`) to `ALLOWED_ATTR` in
  **`src/atlas/sanitizeHtml.ts`** (~L46–54) — note the correct path is `src/atlas/sanitizeHtml.ts`, *not*
  `src/atlas/content/`. The placeholder tag (`span`/`div`) is already in `ALLOWED_TAGS`.
- **Render (corrected mechanism):** `EntityPanel.tsx` (`src/atlas/entity/EntityPanel.tsx`, ~L319) injects the
  prebuilt, re-sanitized body HTML directly — React does **not** mount components inside that injected markup.
  So a `useEffect` locates `[data-secret-id]` nodes after render and wires decrypt/reveal behavior via DOM +
  event delegation (the **same pattern wikilinks already use**), rendering the sealed/teaser UI imperatively.
- **Re-sanitize decrypted content:** when a reveal is decrypted client-side, run it through the same
  `markdownToHtml` + `sanitizeAtlasHtml` pipeline as the body before inserting — never insert raw decrypted
  HTML.
- **Pins:** add `secretId?` to `PinPlacementStyle`/`MapPlacement` (`src/atlas/content/schema.ts` ~L187–208).
  In the player placement loop (`build-atlas.ts` ~L600–625), a pin whose secret is **character-lock must be
  filtered out for non-owners** (placements are plain JSON, not sanitized HTML, so leaving it leaks the
  secret's existence); **password-lock pins may remain visible**.
- **Search-index strip (real leak fix):** add `stripSecretMarkers(s) = s.replace(/\{\{secret:[^}]+\}\}/g, "")`
  and apply it to `entity.body` **before** building search-index fields, **and specifically to the `excerpt`
  field** — `excerpt` is built from raw `entity.body` (~L972) and is **not** run through `stripMdCore`, whose
  regex does not handle `{{}}` braces. Apply on the DM build path too, for consistency.
- **Unmatched-marker warning:** after parsing secrets, collect frontmatter ids, scan the body for
  `{{secret:…}}` ids, and push any orphan to `buildReport.warnings` (file + entity + id) — surfaced in Publish
  Check, never a silent drop.
- **Client unlock store:** new `atlas-unlocked-secrets-v1` localStorage module mirroring
  `src/atlas/notes/playerNotes.ts` (key + `getStorage()` probe + try/catch). Stores unlocked ids and the
  active character key (the player's own key, on their own device).
- **Crypto util:** shared `encrypt()` (Node) / `decrypt()` (Web Crypto) module agreeing on the pinned params.
- **Scan registration:** `scripts/check-player-secrets.ts` + push into the orchestrator tasks array
  (`publish-orchestrator.ts` ~L51–61).

## DM editor surfaces (real designs, both gated by `__INCLUDE_EDITOR__`)

- **Character keys panel** — one row per character: name + key; **Generate key**; **Copy to clipboard** (with
  confirmation); a "share this with the player out-of-band" help line; **"show again"** for a lost key (keys
  are recoverable from the file — say so). Persists to the fixed path `content/_dm/character-keys.yaml`
  (`atlas.visibility: dm`) via `/__atlas/save`. **Requires an allowlist change:** `isWritableSourcePath` in
  `src/atlas/save/sourcePathAllowlist.ts` currently rejects `content/_dm/*.yaml` (only `_atlas` YAML or `.md`
  are writable), so it must be extended to permit this single fixed DM keys path (kept folder-excluded).
  *(Note: `check-derived-secrets` protects DM entity titles/aliases, not key values — key-value protection is
  `check-player-secrets`' job.)*
- **"Insert secret" button** — a small modal: *who is this for?* (character dropdown **OR** "puzzle password"),
  *what do they learn?* (reveal), optional *teaser*. Writes the frontmatter entry with an auto-generated id and
  inserts `{{secret:id}}` at the cursor.
- **Preview** — "Preview as players see it" renders secrets **sealed** (the `projectEntityForPlayer` mirror
  learns the marker→placeholder transform too), so the DM can visually confirm redaction before publishing.

## Edge cases & decisions

- **Teaser** (password type only) is the one secret-adjacent string that ships in plaintext; the scan
  allowlists `teaser` and forbids `reveal`/`password`.
- **Multiple characters on one device:** the secrets tab supports "sign in as another character" / "forget".
- **Reduced motion / accessibility:** reveal animation respects `prefers-reduced-motion`; boxes are
  keyboard-operable with labels.
- **Brute force:** no lockout (static site); PBKDF2 cost is the deterrent. Adequate for *strong* table
  passphrases; weak one-word passwords are not safe (see open decision 4).

## Testing strategy

- **Crypto round-trip & vectors:** Node `encrypt()` output decrypts under browser `decrypt()` with the right
  key, fails cleanly with the wrong one; committed shared test vectors.
- **Leak scan self-test:** planted plaintext + passphrase fixture must fail the build across `atlas.json` and
  all `search-index.json` fields; clean fixture passes. Includes a `{{secret:` survival check.
- **Sealed-in-projection:** player projection contains only ciphertext blobs, no `reveal`/`password`.
- **Visibility:** character secret renders nothing for a non-owner key, reveals for the owner key; password box
  visible to all, reveals only on the correct password; character-lock **pin** is absent for non-owners.
- **Re-sanitize:** a reveal containing `<script>`/HTML is neutralized on display.
- **Persistence:** unlock survives reload; "forget on this device" clears it.

## Scope & non-goals for this feature

- **In:** both lock types; inline + pin + tab surfaces; the editor keys panel + insert button; the crypto
  engine; the leak scan. Shipped together (built in safe, tested increments under the hood).
- **Out (now):** server anything; per-secret lockout/rate-limiting; key recovery beyond "show the same key
  again"; group selectors beyond a shared password; rich-media secrets beyond markdown.

## Resolved decisions (DM, 2026-06-17)

1. **Lost key → show the same key again.** The keys file is the source of truth; the panel re-displays a
   player's existing key for re-sharing. No key reissue flow, no rebuild required.
2. **Revealed text = full markdown.** A secret may contain links, emphasis, and image embeds, rendered through
   the same `markdownToHtml` + `sanitizeAtlasHtml` pipeline (decrypted content is always re-sanitized).
3. **"Your character's secrets" page = always visible** in the player nav, so players know where to sign in
   with their key; the page is empty/locked until they do.
4. **Puzzle-password strength = nudge only, allow anything.** The editor suggests strong phrases but enforces
   no minimum. Rationale (DM): a character password is personalized and hard to guess, and an area/puzzle
   password is *intended* to be discoverable in the world's lore — so offline-guessing of a "weak" password is
   not a threat for this use. Character-key backstory secrets remain cryptographically safe regardless.
