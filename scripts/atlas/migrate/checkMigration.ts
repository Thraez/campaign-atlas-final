/**
 * `atlas:migrate-v2 --check` (R-20): prove a migration changes nothing a
 * player sees. Builds the original's v1 player output and, in a fresh temp
 * folder, the migrated copy's v2 player output for campaign `main`, and
 * compares them (`compareOutputs`). Then the DM builds: the migrated one must
 * hold every entity and item the original's does. With `roundTrip`, the copy
 * is also migrated back down and its v1 player output compared with the
 * original's. Every build only plans its writes; the temp folders are removed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAtlas, type BuildAtlasResult } from "../../build-atlas";
import {
  characterKeysPath,
  parseCharacterKeys,
} from "../../../src/atlas/secrets/characterKeysFile";
import { loadAtlasModel, type LoadAtlasModelConfig } from "../loadAtlasModel";
import { parseNoteFields } from "../parseFrontmatter";
import {
  comparePlayerOutputs,
  compareSecrets,
  dmItems,
  v1Assets,
  v2Assets,
  type SecretKeys,
} from "./compareOutputs";
import {
  MIGRATED_CAMPAIGN,
  MigrationRefused,
  planMigrateDown,
  planMigrateUp,
  writeMigration,
  type MigrationPlan,
} from "./migrateV2";

export interface AtlasConfigFile extends LoadAtlasModelConfig {
  contentRoot: string;
  outputDir: string;
  [key: string]: unknown;
}

export interface CheckResult {
  ok: boolean;
  /** v1 original vs v2 migrated, player, campaign main. Empty when equal. */
  player: string[];
  /** Items the original's DM build holds and the migrated one's doesn't, apart from the declared drops. */
  dmMissing: string[];
  /** v1 original vs v1 round trip (v1 -> v2 -> v1), player. Empty when equal; absent unless asked. */
  roundTrip?: string[];
  /** A build that failed, naming which. */
  failures: string[];
  warnings: string[];
}

export function readConfig(configPath: string): AtlasConfigFile {
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as AtlasConfigFile;
}

/** A temp project: `atlas.config.json` naming `content/`, the rest of the config as it was. */
function tempProject(config: AtlasConfigFile, label: string): { dir: string; content: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `atlas-migrate-${label}-`));
  fs.writeFileSync(
    path.join(dir, "atlas.config.json"),
    `${JSON.stringify({ ...config, contentRoot: "content", outputDir: "out" }, null, 2)}\n`,
  );
  return { dir, content: path.join(dir, "content") };
}

/**
 * The configured passphrase of every secret in the content: a password
 * secret's own, a character secret's from its world's character-keys file.
 * Only handed to `compareSecrets`; never printed.
 */
export function secretKeysOf(
  contentRoot: string,
  config: LoadAtlasModelConfig,
  root: string,
): SecretKeys {
  const { notes } = loadAtlasModel(contentRoot, config, { root });
  const charKeys = new Map<string, Map<string, string>>();
  const keysOf = (world: string) => {
    let m = charKeys.get(world);
    if (!m) {
      m = new Map();
      const p = characterKeysPath(contentRoot, world);
      if (fs.existsSync(p)) {
        const parsed = parseCharacterKeys(fs.readFileSync(p, "utf8"));
        if (parsed.ok) for (const { name, key } of parsed.entries) m.set(name, key);
      }
      charKeys.set(world, m);
    }
    return m;
  };
  const keys = new Map<string, string>();
  for (const n of notes) {
    for (const s of parseNoteFields(n.note).atlas.secrets ?? []) {
      const key = s.for !== undefined ? keysOf(n.world).get(s.for) : s.password;
      if (key !== undefined) keys.set(`${n.note.id}/${s.id}`, key);
    }
  }
  return (entity, secret) => keys.get(`${entity}/${secret}`);
}

/** Write a down plan's `public/` files (and only those) into a temp project. */
function writePublicAssets(plan: MigrationPlan, projectDir: string): void {
  for (const [src, bytes] of plan.publicAssets) {
    const to = path.join(projectDir, "public", ...src.split("/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, bytes);
  }
}

async function build(
  label: string,
  root: string,
  flags: Parameters<typeof buildAtlas>[1],
  failures: string[],
): Promise<BuildAtlasResult | null> {
  try {
    const r = await buildAtlas(root, flags);
    if (r.report.failure) {
      failures.push(`${label}: ${r.report.failure.message} (exit ${r.report.failure.exitCode})`);
      return null;
    }
    return r;
  } catch (e) {
    failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Quiet the builds' console report unless asked; restored after. */
async function quietly<T>(verbose: boolean, run: () => Promise<T>): Promise<T> {
  if (verbose) return run();
  const saved = { log: console.log, warn: console.warn, info: console.info };
  console.log = console.warn = console.info = () => {};
  try {
    return await run();
  } finally {
    Object.assign(console, saved);
  }
}

export async function checkMigration(opts: {
  /** The project root (holds `public/`). */
  root: string;
  configPath: string;
  roundTrip?: boolean;
  verbose?: boolean;
  /** Passed to the migration: drop shipping pins' label and style (declared, not compared). */
  allowDropPinStyle?: boolean;
  /** Tests only: edit the migrated copy before it's built (the check must catch it). */
  editMigrated?: (contentDir: string) => void;
}): Promise<CheckResult> {
  const root = path.resolve(opts.root);
  const configPath = path.resolve(root, opts.configPath);
  const config = readConfig(configPath);
  const contentRoot = path.resolve(path.dirname(configPath), config.contentRoot);
  const result: CheckResult = { ok: false, player: [], dmMissing: [], failures: [], warnings: [] };

  const up = planMigrateUp({
    contentRoot,
    config,
    root,
    publicDir: path.join(root, "public"),
    allowDropPinStyle: opts.allowDropPinStyle,
  });
  if (up.alreadyDone) {
    result.failures.push("the content is already schema v2; --check compares a v1 original");
    return result;
  }
  result.warnings.push(...up.warnings);
  const keyFor = secretKeysOf(contentRoot, config, root);
  const temps: string[] = [];
  try {
    const v2 = tempProject(config, "v2");
    temps.push(v2.dir);
    writeMigration(up, v2.content, contentRoot);
    opts.editMigrated?.(v2.content);

    await quietly(!!opts.verbose, async () => {
      const f = result.failures;
      const v1Player = await build(
        "v1 player build of the original",
        root,
        { player: true, strict: true, configPath },
        f,
      );
      const v2Player = await build(
        "v2 player build of the migrated copy",
        v2.dir,
        { player: true, strict: true, campaign: MIGRATED_CAMPAIGN },
        f,
      );
      if (v1Player && v2Player) {
        result.player = comparePlayerOutputs(
          v1Player,
          v1Assets(v1Player),
          v2Player,
          v2Assets(v2Player),
          v2Player.store?.files.values(),
          up.dropped,
        ).differences;
        result.player.push(...(await compareSecrets(v1Player, v2Player, keyFor)));
      }
      const v1Dm = await build(
        "v1 DM build of the original",
        root,
        { player: false, strict: false, configPath },
        f,
      );
      const v2Dm = await build(
        "v2 DM build of the migrated copy",
        v2.dir,
        { player: false, strict: false },
        f,
      );
      if (v1Dm && v2Dm) {
        const has = dmItems(v2Dm);
        const declared = new Set(up.dropped);
        result.dmMissing = [...dmItems(v1Dm)].filter((i) => !has.has(i) && !declared.has(i)).sort();
      }

      if (opts.roundTrip && v1Player) {
        let down: MigrationPlan;
        try {
          // v1 reads map images and audio from public/: the down plan checks
          // each against the copy's and lists the ones it needs.
          down = planMigrateDown({
            contentRoot: v2.content,
            config,
            root: v2.dir,
            publicDir: path.join(root, "public"),
          });
        } catch (e) {
          if (!(e instanceof MigrationRefused)) throw e;
          f.push(`round trip: the down-migration refused: ${e.reasons.join("; ")}`);
          return;
        }
        result.warnings.push(...down.warnings.map((w) => `down: ${w}`));
        const back = tempProject(config, "v1");
        temps.push(back.dir);
        writeMigration(down, back.content, v2.content);
        writePublicAssets(down, back.dir);
        const v1Back = await build(
          "v1 player build of the round trip",
          back.dir,
          { player: true, strict: true },
          f,
        );
        if (v1Back) {
          result.roundTrip = comparePlayerOutputs(
            v1Player,
            v1Assets(v1Player),
            v1Back,
            v1Assets(v1Back),
            undefined,
            up.dropped,
          ).differences;
          result.roundTrip.push(...(await compareSecrets(v1Player, v1Back, keyFor)));
        }
      }
    });
  } finally {
    for (const t of temps) fs.rmSync(t, { recursive: true, force: true });
  }
  result.ok =
    result.failures.length === 0 &&
    result.player.length === 0 &&
    result.dmMissing.length === 0 &&
    (result.roundTrip?.length ?? 0) === 0;
  return result;
}

export interface DownCheckResult {
  ok: boolean;
  /** v2 original (campaign main) vs v1 down-migrated copy, player. Empty when equal. */
  player: string[];
  failures: string[];
  warnings: string[];
}

/**
 * `--down --out`'s check: the v1 player output of the down-migrated copy must
 * equal the original's v2 player output for campaign `main`.
 */
export async function checkMigrationDown(opts: {
  root: string;
  configPath: string;
  verbose?: boolean;
}): Promise<DownCheckResult> {
  const root = path.resolve(opts.root);
  const configPath = path.resolve(root, opts.configPath);
  const config = readConfig(configPath);
  const contentRoot = path.resolve(path.dirname(configPath), config.contentRoot);
  const result: DownCheckResult = { ok: false, player: [], failures: [], warnings: [] };
  const down = planMigrateDown({ contentRoot, config, root, publicDir: path.join(root, "public") });
  if (down.alreadyDone) {
    result.failures.push("the content is already schema v1; --down compares a v2 original");
    return result;
  }
  result.warnings.push(...down.warnings);
  const keyFor = secretKeysOf(contentRoot, config, root);
  const back = tempProject(config, "v1");
  try {
    writeMigration(down, back.content, contentRoot);
    writePublicAssets(down, back.dir);
    await quietly(!!opts.verbose, async () => {
      const f = result.failures;
      const v2Player = await build(
        "v2 player build of the original",
        root,
        { player: true, strict: true, configPath, campaign: MIGRATED_CAMPAIGN },
        f,
      );
      const v1Player = await build(
        "v1 player build of the down-migrated copy",
        back.dir,
        { player: true, strict: true },
        f,
      );
      if (v2Player && v1Player) {
        result.player = comparePlayerOutputs(
          v2Player,
          v2Assets(v2Player),
          v1Player,
          v1Assets(v1Player),
        ).differences;
        result.player.push(...(await compareSecrets(v2Player, v1Player, keyFor)));
      }
    });
  } finally {
    fs.rmSync(back.dir, { recursive: true, force: true });
  }
  result.ok = result.failures.length === 0 && result.player.length === 0;
  return result;
}
