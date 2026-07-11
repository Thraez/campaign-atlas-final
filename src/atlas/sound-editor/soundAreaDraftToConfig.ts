/**
 * Fold the soundscape draft's `effective` config into the exact
 * `SoundscapeConfig` to set on the active map via `patchMap({ soundscape })`:
 *
 * - no areas ⇒ `undefined` (drop the `soundscape` key entirely);
 * - blank `name` ⇒ omitted;
 * - `enabled: false` and any present `masterGain` are preserved as-is.
 *
 * Deliberately does NOT strip default `masterGain`/`gain` values — that is
 * `soundscapeToYamlObject`'s job (Phase 1a) on the way to YAML. This helper
 * only guarantees a well-formed in-memory config for the unified Save.
 *
 * EDITOR-ONLY and pure: imports schema types only; never import this from the
 * player runtime (`src/atlas/sound/`), AtlasViewer, or Landing.
 */
import type { SoundArea, SoundscapeConfig } from "@/atlas/content/schema";

export function soundAreaDraftToConfig(
  sc: SoundscapeConfig,
): SoundscapeConfig | undefined {
  const areas = sc.areas ?? [];
  if (areas.length === 0) return undefined;

  const cleanAreas: SoundArea[] = areas.map((a) => {
    const name = a.name?.trim();
    if (name) return { ...a, name };
    if (a.name !== undefined) {
      const { name: _blank, ...rest } = a;
      void _blank;
      return rest;
    }
    return a;
  });

  const out: SoundscapeConfig = { areas: cleanAreas };
  if (sc.enabled !== undefined) out.enabled = sc.enabled;
  if (sc.masterGain !== undefined) out.masterGain = sc.masterGain;
  return out;
}
