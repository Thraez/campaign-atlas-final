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
import type { LoadAtlasModelConfig } from "../loadAtlasModel";
import { comparePlayerOutputs, dmItems, v1Assets, v2Assets } from "./compareOutputs";
import { MIGRATED_CAMPAIGN, planMigrateDown, planMigrateUp, writeMigration } from "./migrateV2";

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
}): Promise<CheckResult> {
  const root = path.resolve(opts.root);
  const configPath = path.resolve(root, opts.configPath);
  const config = readConfig(configPath);
  const contentRoot = path.resolve(path.dirname(configPath), config.contentRoot);
  const result: CheckResult = { ok: false, player: [], dmMissing: [], failures: [], warnings: [] };

  const up = planMigrateUp({ contentRoot, config, root, publicDir: path.join(root, "public") });
  if (up.alreadyDone) {
    result.failures.push("the content is already schema v2; --check compares a v1 original");
    return result;
  }
  result.warnings.push(...up.warnings);
  const temps: string[] = [];
  try {
    const v2 = tempProject(config, "v2");
    temps.push(v2.dir);
    writeMigration(up, v2.content, contentRoot);

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
        ).differences;
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
        const down = planMigrateDown({ contentRoot: v2.content, config, root: v2.dir });
        result.warnings.push(...down.warnings.map((w) => `down: ${w}`));
        const back = tempProject(config, "v1");
        temps.push(back.dir);
        writeMigration(down, back.content, v2.content);
        // v1 reads map images and audio from public/: the original's.
        fs.cpSync(
          path.join(root, "public", "atlas", "assets"),
          path.join(back.dir, "public", "atlas", "assets"),
          {
            recursive: true,
          },
        );
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
          ).differences;
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
