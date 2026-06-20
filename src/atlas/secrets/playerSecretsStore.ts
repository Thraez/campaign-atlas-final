/**
 * Player-local secret-unlock state — browser-only, never uploaded.
 * Holds the active character key (the player's own key, on their own device)
 * and the set of unlocked password-secret ids.
 * Mirrors notes/playerNotes.ts storage rules.
 */
const STORAGE_KEY = "atlas-unlocked-secrets-v1";

interface SecretState {
  characterKey: string | null;
  unlocked: string[];
}

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
      unlocked: Array.isArray(p?.unlocked)
        ? p.unlocked.filter((x: unknown) => typeof x === "string")
        : [],
    };
  } catch {
    return { characterKey: null, unlocked: [] };
  }
}

function save(state: SecretState): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota — ignore
  }
}

export function getCharacterKey(): string | null {
  return load().characterKey;
}

export function setCharacterKey(key: string | null): void {
  const st = load();
  st.characterKey = key;
  save(st);
}

export function isUnlocked(secretId: string): boolean {
  return load().unlocked.includes(secretId);
}

export function markUnlocked(secretId: string): void {
  const st = load();
  if (!st.unlocked.includes(secretId)) {
    st.unlocked.push(secretId);
    save(st);
  }
}

export function forgetAll(): void {
  save({ characterKey: null, unlocked: [] });
}

export function _resetForTests(): void {
  const s = getStorage();
  try {
    s?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
