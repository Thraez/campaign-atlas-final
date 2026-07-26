// Dev tool: converts oversized source map PNGs under public/atlas/assets/maps
// into .webp twins via sharp, and repoints the matching world.yaml layers[].src
// entries from .png to .webp. Mirrors scripts/dev/transcode-audio.mjs's shape:
// the source PNG is kept (twin, not replace), same as audio keeps its source
// .wav alongside the compressed .ogg/.m4a.
//
// Run with: npm run maps:optimize
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";

const MAPS_DIR = "public/atlas/assets/maps";
const SEARCH_ROOTS = ["content", "examples"];
// Matches SIZE_WARN_BYTES in src/atlas/assets/assetSize.ts — the existing
// "oversized" budget concept the rest of the asset pipeline already uses.
const OVERSIZE_BYTES = 1 * 1024 * 1024;
// Matches the webp quality used by the save pipeline's metadata-strip step
// (scripts/vite-plugin-atlas-save.ts).
const WEBP_QUALITY = 85;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findWorldYamlFiles(rootDirs) {
  const found = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && e.name === "world.yaml" && basename(dir) === "_atlas") {
        found.push(full);
      }
    }
  }
  for (const root of rootDirs) walk(root);
  return found;
}

function isOversizedPng(file) {
  return /\.png$/i.test(file) && statSync(join(MAPS_DIR, file)).size > OVERSIZE_BYTES;
}

async function main() {
  const sources = readdirSync(MAPS_DIR).filter(isOversizedPng);
  if (sources.length === 0) {
    console.log("maps:optimize: no oversized PNG sources found, nothing to do.");
    return;
  }

  const worldYamlFiles = findWorldYamlFiles(SEARCH_ROOTS);

  for (const f of sources) {
    const src = join(MAPS_DIR, f);
    const webpName = f.replace(/\.png$/i, ".webp");
    const webp = join(MAPS_DIR, webpName);

    await sharp(src).webp({ quality: WEBP_QUALITY }).toFile(webp);

    const beforeKb = Math.round(statSync(src).size / 1024);
    const afterKb = Math.round(statSync(webp).size / 1024);
    console.log(`${f}: png ${beforeKb}KB -> webp ${afterKb}KB`);

    const pattern = new RegExp(`(src:\\s*/?atlas/assets/maps/)${escapeRegExp(f)}\\b`, "g");
    let rewrites = 0;
    for (const yamlPath of worldYamlFiles) {
      const text = readFileSync(yamlPath, "utf8");
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        writeFileSync(yamlPath, text.replace(pattern, `$1${webpName}`));
        rewrites++;
        console.log(`  -> repointed ${yamlPath}`);
      }
      pattern.lastIndex = 0;
    }
    if (rewrites === 0) {
      console.log(`  -> no world.yaml reference found for ${f} (webp twin emitted, nothing to repoint)`);
    }
  }
}

main();
