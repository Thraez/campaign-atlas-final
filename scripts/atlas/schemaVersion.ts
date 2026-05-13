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
 *   • Future versions must add a migration step in `MIGRATIONS` and bump
 *     `CURRENT_ATLAS_SCHEMA_VERSION`.
 */

export const CURRENT_ATLAS_SCHEMA_VERSION = 1 as const;
export const LEGACY_ATLAS_SCHEMA_VERSION = 1 as const;
export const MIN_SUPPORTED_ATLAS_SCHEMA_VERSION = 1 as const;

export class SchemaVersionError extends Error {}

type AnyYaml = Record<string, unknown>;

/**
 * Each migration takes input at version N and returns input at version N+1.
 * Currently only legacy (unversioned -> v1) normalization is needed and that
 * is handled by `resolveSchemaVersion` directly, so this map is a stub kept
 * here so adding a future migration is a one-line change.
 */
const MIGRATIONS: Record<number, (input: AnyYaml, warnings: string[]) => AnyYaml> = {
  // Example for a future version:
  // 1: (input, warnings) => { warnings.push("migrating v1 -> v2: ..."); return { ...input, schemaVersion: 2 }; },
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
  warnings: string[]
): { data: AnyYaml; version: number } {
  const raw = (input as { schemaVersion?: unknown }).schemaVersion;
  let version: number;

  if (raw === undefined || raw === null) {
    warnings.push(
      `${source}: no schemaVersion declared — treating as legacy v${LEGACY_ATLAS_SCHEMA_VERSION}. ` +
        `Add "schemaVersion: ${CURRENT_ATLAS_SCHEMA_VERSION}" at the top of world.yaml to silence this warning.`
    );
    version = LEGACY_ATLAS_SCHEMA_VERSION;
  } else if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new SchemaVersionError(
      `${source}: schemaVersion must be a positive integer (got ${JSON.stringify(raw)}).`
    );
  } else {
    version = raw;
  }

  if (version > CURRENT_ATLAS_SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `${source}: schemaVersion ${version} is newer than this build supports ` +
        `(max ${CURRENT_ATLAS_SCHEMA_VERSION}). Update the atlas build script before loading this world.`
    );
  }
  if (version < MIN_SUPPORTED_ATLAS_SCHEMA_VERSION) {
    throw new SchemaVersionError(
      `${source}: schemaVersion ${version} is no longer supported ` +
        `(min ${MIN_SUPPORTED_ATLAS_SCHEMA_VERSION}). No migration path exists.`
    );
  }

  let data: AnyYaml = input;
  while (version < CURRENT_ATLAS_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new SchemaVersionError(
        `${source}: no migration registered for schemaVersion ${version} -> ${version + 1}.`
      );
    }
    data = step(data, warnings);
    version += 1;
  }

  return { data, version };
}