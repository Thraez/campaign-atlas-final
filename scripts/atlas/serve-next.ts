#!/usr/bin/env tsx
/**
 * `npm run atlas:serve:next [-- --port <n>]` (R-34): serves each campaign site
 * `atlas:publish:next` built (`dist-campaigns/<id>/`) on its own port, and a
 * campaign picker on `<n>` (default 4300); campaign i gets `<n> + 1 + i`, in
 * content order. Local only, `127.0.0.1`. See `serveCampaigns.ts`.
 */
import path from "node:path";
import { parseServeArgs, planServe, startServe, ServeRefusal } from "./serveCampaigns.js";

async function main(): Promise<void> {
  const root = process.cwd();
  let args: { port: number; configPath: string };
  try {
    args = parseServeArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`serve: ${(e as Error).message}`);
    process.exit(1);
  }
  try {
    const campaigns = planServe({ root, configPath: path.resolve(root, args.configPath) });
    const running = await startServe(campaigns, args.port);
    console.log("serve: test site only, on 127.0.0.1");
    console.log(`  picker              http://127.0.0.1:${running.picker}/`);
    for (const c of running.campaigns) {
      const rel = path.relative(root, c.siteDir).split(path.sep).join("/");
      console.log(`  ${c.id.padEnd(18)}  http://127.0.0.1:${c.port}/  (${rel}/)`);
    }
    // The servers keep the process alive until a signal closes them.
    const stop = () => void running.close().then(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (e) {
    console.error(e instanceof ServeRefusal ? e.message : `serve: ${(e as Error).message}`);
    process.exit(e instanceof ServeRefusal ? 2 : 1);
  }
}

void main();
