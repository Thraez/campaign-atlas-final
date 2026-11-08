/**
 * Atlas world.yaml schema versioning.
 *
 * The schema integer increments whenever a breaking change is made to the
 * world.yaml shape that an old loader could not handle correctly. The loader
 * may migrate older inputs forward (see `migrateWorldYaml`) but will refuse
 * to load inputs whose `schemaVersion` is newer than `CURRENT_ATLAS_SCHEMA_VERSION`
 * — that almost certainly means the project is being read by an out-of-date
 * build script.
 *
 * Versioning policy:
 *   • LEGACY (no `schemaVersion` field) is treated as v1 with a warning, so
 *     existing content keeps working untouched.
 *   • v1 = the historical shape: top-level `regions:` / `routes:` / `fog:`
 *     PLUS optional nested `maps[].regions/routes/fog` (the Cockpit format).
 *   • v2 (ADR-0003) = `_atlas/atlas.yaml` plus per-world `world.yaml` files
 *     and campaign files. v1 is NOT migrated to v2 here: `loadAtlasModel`
 *     reads both and presents v1 through the v1 adapter. So
 *     `CURRENT_ATLAS_SCHEMA_VERSION` stays 1 (it is the v1 loader's version,
 *     `loadWorldConfig`), and `MAX_ATLAS_SCHEMA_VERSION` is the newest version
 *     any loader reads. `readSchemaVersion` is the one version check both use.
 *   • Future v1 steps would add a migration in `MIGRATIONS`.
 */

export const CURRENT_ATLAS_SCHEMA_VERSION = 1 as const;
export const LEGACY_ATLAS_SCHEMA_VERSION = 1 as const;
export const MIN_SUPPORTED_ATLAS_SCHEMA_VERSION = 1 as const;

/** Schema v2 (ADR-0003): `atlas.yaml`, v2 `world.yaml` files and campaign files. */
export const ATLAS_SCHEMA_V2 = 2 as const;
/** The newest schema version any loader here reads. */
export const MAX_ATLAS_SCHEMA_VERSION = 2 as const;

export type AtlasSchemaVersion = 1 | 2;

export class SchemaVersionError extends Error {}

/**
 * The one version check: a file's declared `schemaVersion`, or `null` when it
 * declares none (legacy v1). Throws `SchemaVersionError`, naming `source`, for
 * a value that isn't a positive integer or is above `MAX_ATLAS_SCHEMA_VERSION`.
 */
export function readSchemaVersion(input: AnyYaml, source: string): AtlasSchemaVersion | null {
  const raw = (input as { schemaVersion?: unknown }).schemaVersion;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new SchemaVersionError(
      `${source}: schemaVersion must be a positive integer (got ${JSON.stringify(raw)}).`,
    );
  }
  if (raw > MAX_ATLAS_SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `${source}: schemaVersion ${raw} is newer than this build supports ` +
        `(max ${MAX_ATLAS_SCHEMA_VERSION}). Update the atlas build script before loading this world.`,
    );
  }
  return raw as AtlasSchemaVersion;
}

type AnyYaml = Record<string, unknown>;

/**
 * Each migration takes input at version N and returns input at version N+1.
 * Currently only legacy (unversioned -> v1) normalization is needed and that
 * is handled by `resolveSchemaVersion` directly, so this map is a stub kept
 * here so adding a future migration is a one-line change.
 */
const MIGRATIONS: Record<number, (input: AnyYaml, warnings: string[]) => AnyYaml> = {
  // Empty: v1 -> v2 is not an in-memory migration (ADR-0003). v1 is presented
  // as the model by the v1 adapter; the file migration is `atlas:migrate-v2` (R-20).
};

/**
 * Inspect the raw parsed YAML, decide which schema version it is, and run any
 * forward migrations required to reach `CURRENT_ATLAS_SCHEMA_VERSION`.
 *
 * Returns the (possibly migrated) YAML object plus the resolved version.
 * Throws `SchemaVersionError` for unsupported / future versions.
 */
export function resolveAndMigrate(
  input: AnyYaml,
  source: string,
  warnings: string[],
): { data: AnyYaml; version: number } {
  const declared = readSchemaVersion(input, source);
  let version: number;

  if (declared === null) {
    warnings.push(
      `${source}: no schemaVersion declared — treating as legacy v${LEGACY_ATLAS_SCHEMA_VERSION}. ` +
        `Add "schemaVersion: ${CURRENT_ATLAS_SCHEMA_VERSION}" at the top of world.yaml to silence this warning.`,
    );
    version = LEGACY_ATLAS_SCHEMA_VERSION;
  } else {
    version = declared;
  }

  if (version === ATLAS_SCHEMA_V2) {
    throw new SchemaVersionError(
      `${source}: schemaVersion 2 is a v2 world file, which this v1 loader can't read; ` +
        `v2 content loads through loadAtlasModel, with _atlas/atlas.yaml at the content root.`,
    );
  }
  if (version < MIN_SUPPORTED_ATLAS_SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `${source}: schemaVersion ${version} is no longer supported ` +
        `(min ${MIN_SUPPORTED_ATLAS_SCHEMA_VERSION}). No migration path exists.`,
    );
  }

  let data: AnyYaml = input;
  while (version < CURRENT_ATLAS_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new SchemaVersionError(
        `${source}: no migration registered for schemaVersion ${version} -> ${version + 1}.`,
      );
    }
    data = step(data, warnings);
    version += 1;
  }

  return { data, version };
}
