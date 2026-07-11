/**
 * Audio-file listing for the sound panel's file picker (editor-only).
 *
 * `audioBasenames` is the pure core: given any file listing, it keeps only
 * audio files and returns their basenames, de-duped and sorted. The panel
 * shows these as the "Sound" choices; when the list is empty it falls back
 * to a free-text input, so authoring works before any audio is sourced.
 *
 * `loadAvailableAudio` is the thin dev-editor loader: it reads a small static
 * manifest (a JSON `string[]`) emitted next to the audio dir under
 * `public/atlas/assets/audio/` — no new server API. A missing or malformed
 * manifest degrades to an empty list, never an error.
 *
 * Editor-only: never import this from the player runtime (`src/atlas/sound/`)
 * or any player-mode entry point.
 */

const AUDIO_EXTENSION = /\.(ogg|mp3|aac|m4a|wav)$/i;

/** Filter a raw file listing to audio basenames, de-duped and sorted. */
export function audioBasenames(paths: string[]): string[] {
  const names = new Set<string>();
  for (const path of paths) {
    const base = path.split(/[\\/]/).pop() ?? "";
    if (AUDIO_EXTENSION.test(base)) names.add(base);
  }
  return [...names].sort();
}

/**
 * Where the dev editor looks for the audio manifest: a JSON array of file
 * names/paths describing what lives under `public/atlas/assets/audio/`.
 */
export const AUDIO_MANIFEST_URL = "/atlas/assets/audio/manifest.json";

/**
 * Load the list of available audio files for the picker. Any failure —
 * missing manifest, non-JSON body, wrong shape — yields `[]`, which the
 * panel treats as "no files yet" (free-text fallback).
 */
export async function loadAvailableAudio(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<string[]> {
  try {
    const res = await fetchImpl(AUDIO_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return audioBasenames(data.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return [];
  }
}
