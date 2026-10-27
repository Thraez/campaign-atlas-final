// PreToolUse hook: refuse Edit/Write/MultiEdit on build outputs.
// Exit 2 blocks the tool call; stderr is shown to Claude.
// Node, not PowerShell, so it runs on both the PC and the Mac (no pwsh there).
import path from "node:path";
import { readFileSync } from "node:fs";

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

let data;
try {
  const raw = readFileSync(0, "utf8");
  if (!raw.trim()) block("block-generated-paths: missing hook input; refusing the write.");
  data = JSON.parse(raw);
} catch (err) {
  block(`block-generated-paths: invalid JSON on stdin: ${err}`);
}

const filePath = data?.tool_input?.file_path;
if (typeof filePath !== "string" || !filePath.trim()) {
  block("block-generated-paths: write tool supplied no file path; refusing the write.");
}

const projectRoot = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const fullPath = path.resolve(projectRoot, filePath).toLowerCase();

const forbiddenRoots = ["public/atlas", ".local-atlas", "dist", "dist-ssr"].map((p) =>
  path.join(projectRoot, p).toLowerCase(),
);

for (const root of forbiddenRoots) {
  if (fullPath === root || fullPath.startsWith(root + path.sep)) {
    block(
      `Refusing to edit generated artifact at '${filePath}'. These paths are build outputs of the atlas pipeline. ` +
        "Edit the source (YAML frontmatter, world.yaml, scripts/, or src/) and rebuild with " +
        "'npm run atlas:build:player' or 'npm run atlas:publish'.",
    );
  }
}

process.exit(0);
