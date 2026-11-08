/**
 * Draws the small lossless map images of the v2 test world (`content-next/`,
 * R-16): flat shapes, no text, no metadata. Run once after changing a map's
 * size; the PNGs are committed, so nothing else needs this script.
 *
 *   node scripts/dev/generate-test-world-maps.mjs
 *
 * Each image matches its map's `width`/`height` in `world.yaml`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** [world, map, width, height, land colour, shapes as SVG] */
const MAPS = [
  [
    "quessaly",
    "quessaly-world",
    600,
    400,
    "#c9b98a",
    `<ellipse cx="390" cy="140" rx="120" ry="80" fill="#9fb07a"/>
     <path d="M40 330 Q140 260 260 300 T560 320 L560 400 L40 400 Z" fill="#7f9a6a"/>`,
  ],
  [
    "quessaly",
    "oskmark",
    600,
    400,
    "#a8b884",
    `<rect x="160" y="220" width="130" height="160" fill="#5f7a5a"/>
     <rect x="40" y="240" width="80" height="80" fill="#8fb0a0"/>
     <rect x="80" y="60" width="100" height="75" fill="#b89a6a"/>
     <rect x="400" y="250" width="100" height="75" fill="#b89a6a"/>
     <path d="M300 0 L300 400" stroke="#6a6a6a" stroke-width="2" stroke-dasharray="8 6"/>`,
  ],
  [
    "quessaly",
    "brindlecross",
    400,
    300,
    "#d8c8a8",
    `<rect x="60" y="60" width="280" height="180" fill="#b0906a"/>
     <circle cx="200" cy="150" r="30" fill="#8a6a4a"/>`,
  ],
  [
    "quessaly",
    "tallowford",
    400,
    300,
    "#d0c0a0",
    `<path d="M0 200 Q200 140 400 210 L400 240 Q200 170 0 230 Z" fill="#6a8aa8"/>
     <rect x="120" y="60" width="160" height="100" fill="#a8885a"/>`,
  ],
  [
    "skerrow",
    "skerrow-isles",
    500,
    500,
    "#5a7a98",
    `<circle cx="150" cy="160" r="90" fill="#b8a888"/>
     <circle cx="330" cy="320" r="110" fill="#a89878"/>`,
  ],
  [
    "skerrow",
    "hookhaven",
    300,
    300,
    "#c8b898",
    `<path d="M0 220 Q150 160 300 230 L300 300 L0 300 Z" fill="#5a7a98"/>
     <rect x="90" y="70" width="120" height="90" fill="#987858"/>`,
  ],
];

for (const [world, id, width, height, land, shapes] of MAPS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${land}"/>${shapes}</svg>`;
  const out = path.join(ROOT, "content-next", world, "_atlas", "images", `${id}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  console.log(`${path.relative(ROOT, out)} ${width}x${height}`);
}
