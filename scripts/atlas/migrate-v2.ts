/**
 * `npm run atlas:migrate-v2` (R-20): migrate the content root from schema v1
 * to v2 (ADR-0003), or back with `--down`, into a separate folder.
 *
 *   atlas:migrate-v2                      print the plan; write nothing (dry run)
 *   atlas:migrate-v2 --dry-run            the same
 *   atlas:migrate-v2 --out <dir>          write the migrated tree to <dir>
 *   atlas:migrate-v2 --down --out <dir>   write the v2 -> v1 tree to <dir>
 *   atlas:migrate-v2 --check              build both and compare the player output
 *   --config <file>                       the atlas config (default atlas.config.json)
 *
 * It never writes to the content root: `--out` must be a new or empty folder
 * outside it. Replacing the content root with the copy is a separate, manual
 * step (ADR-0003 "Versions").
 */
import path from "node:path";
import { checkMigration, readConfig } from "./migrate/checkMigration";
import {
  MigrationRefused,
  checkOutDir,
  planMigrateDown,
  planMigrateUp,
  writeMigration,
  type MigrationPlan,
} from "./migrate/migrateV2";

interface Args {
  out?: string;
  dryRun: boolean;
  down: boolean;
  check: boolean;
  config: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, down: false, check: false, config: "atlas.config.json" };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--out") a.out = argv[++i];
    else if (v.startsWith("--out=")) a.out = v.slice(6);
    else if (v === "--dry-run") a.dryRun = true;
    else if (v === "--down") a.down = true;
    else if (v === "--check") a.check = true;
    else if (v === "--config") a.config = argv[++i];
    else if (v.startsWith("--config=")) a.config = v.slice(9);
    else throw new MigrationRefused([`unknown argument "${v}"`]);
  }
  if (a.out === "") throw new MigrationRefused(["--out needs a folder"]);
  return a;
}

function printPlan(plan: MigrationPlan, wrote: string | null): void {
  console.log(`\natlas:migrate-v2 (${plan.direction === "up" ? "v1 -> v2" : "v2 -> v1"})`);
  for (const s of plan.summary) console.log(`  ${s}`);
  if (!plan.alreadyDone) {
    console.log(`\n  new or changed files:`);
    for (const f of plan.changed) console.log(`    ${f}`);
  }
  if (plan.warnings.length > 0) {
    console.log(`\n  warnings (${plan.warnings.length}):`);
    for (const w of plan.warnings) console.log(`    ! ${w}`);
  }
  console.log(
    wrote ? `\n  wrote ${plan.files.size} files to ${wrote}\n` : `\n  dry run: nothing written\n`,
  );
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const configPath = path.resolve(root, args.config);
  if (args.check) {
    const r = await checkMigration({ root, configPath, roundTrip: true });
    console.log("\natlas:migrate-v2 --check");
    for (const w of r.warnings) console.log(`  ! ${w}`);
    for (const f of r.failures) console.log(`  x ${f}`);
    const section = (title: string, lines: string[] | undefined) => {
      if (!lines) return;
      console.log(
        `  ${title}: ${lines.length === 0 ? "no difference" : `${lines.length} difference(s)`}`,
      );
      for (const l of lines) console.log(`    - ${l}`);
    };
    section("player output, v1 original vs v2 migrated (campaign main)", r.player);
    section("DM build, items missing from the migrated", r.dmMissing);
    section("player output, v1 original vs v1 round trip", r.roundTrip);
    console.log(r.ok ? "\n  check passed\n" : "\n  check FAILED\n");
    return r.ok ? 0 : 1;
  }
  const config = readConfig(configPath);
  const contentRoot = path.resolve(path.dirname(configPath), config.contentRoot);
  const opts = { contentRoot, config, root, publicDir: path.join(root, "public") };
  const out = args.dryRun ? undefined : args.out;
  // Refuse a bad --out before the work, so a dry run says so too.
  if (args.out) checkOutDir(path.resolve(root, args.out), contentRoot);
  const plan = args.down ? planMigrateDown(opts) : planMigrateUp(opts);
  if (out && !plan.alreadyDone) {
    writeMigration(plan, path.resolve(root, out), contentRoot);
    printPlan(plan, path.resolve(root, out));
  } else {
    printPlan(plan, null);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    if (e instanceof MigrationRefused) {
      console.error(`\n${e.message}\n`);
      process.exit(2);
    }
    console.error(e);
    process.exit(1);
  },
);
