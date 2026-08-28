/**
 * Dev tool: brings the image library in line with the encoding policy.
 *
 * Both ways an image can enter the atlas — the editor's picker and the vault
 * embed copier — already convert PNG/JPEG to WebP on the way in. This script
 * is the safety net for everything else: images that predate the policy, or
 * that were dropped into the folder with a plain `git add`. Running it is
 * idempotent, so it is safe to run whenever a library looks heavy.
 *
 * Unlike maps:optimize, which keeps its source PNG as a twin, this REPLACES
 * the original. An image that nothing references is an orphan, and
 * scripts/atlas/audit-assets.ts warns on orphans — a twin would trade a size
 * problem for a permanent audit warning, and would keep shipping the bytes.
 *
 * Maps are not touched. They live under assets/maps/, want lossless for fog
 * redaction and map labels, and have their own optimizer.
 *
 * Run with: npm run images:optimize
 */
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";
import {
  shouldConvertToWebp,
  webpTargetName,
  WEBP_QUALITY,
  MAX_IMAGE_WIDTH,
} from "../../src/atlas/assets/imageEncoding";

const DEFAULT_IMAGES_DIR = "public/atlas/assets/images";
const DEFAULT_CONTENT_ROOTS = ["content", "examples"];

export interface ConvertedImage {
  from: string;
  to: string;
  beforeBytes: number;
  afterBytes: number;
  /** Content files whose references were repointed at the new name. */
  rewrittenFiles: string[];
}

export interface OptimizeImagesResult {
  converted: ConvertedImage[];
}

export interface OptimizeImagesOptions {
  imagesDir?: string;
  contentRoots?: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every markdown file under the given roots. */
function findMarkdownFiles(rootDirs: string[]): string[] {
  const found: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) found.push(full);
    }
  }
  for (const root of rootDirs) walk(root);
  return found;
}

/**
 * Repoint every reference to `from` at `to`.
 *
 * Matches the bare filename, which covers both spellings the atlas uses: an
 * Obsidian embed (`![[Corven.png]]`) and a resolved markdown link
 * (`![](/atlas/assets/images/Corven.png)`). The lookbehind-free boundary check
 * keeps `Corven.png` from matching inside `Old-Corven.png`.
 */
function repointReferences(files: string[], from: string, to: string): string[] {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(from)}\\b`, "g");
  const touched: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const next = text.replace(pattern, (_m, lead: string) => `${lead}${to}`);
    if (next !== text) {
      writeFileSync(file, next);
      touched.push(file);
    }
  }
  return touched;
}

export async function optimizeImages(
  opts: OptimizeImagesOptions = {},
): Promise<OptimizeImagesResult> {
  const imagesDir = opts.imagesDir ?? DEFAULT_IMAGES_DIR;
  const contentRoots = opts.contentRoots ?? DEFAULT_CONTENT_ROOTS;

  let entries: string[];
  try {
    entries = readdirSync(imagesDir);
  } catch {
    return { converted: [] };
  }

  const sources = entries.filter((f) => shouldConvertToWebp(extname(f)));
  if (sources.length === 0) return { converted: [] };

  const markdownFiles = findMarkdownFiles(contentRoots);
  const converted: ConvertedImage[] = [];

  for (const from of sources) {
    const srcPath = join(imagesDir, from);
    const to = webpTargetName(from);
    const outPath = join(imagesDir, to);
    const beforeBytes = statSync(srcPath).size;

    // Read the bytes rather than handing sharp the path: sharp reads lazily
    // and holds the file open, which on Windows blocks the rmSync below.
    const out = await sharp(readFileSync(srcPath))
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    writeFileSync(outPath, out);
    rmSync(srcPath, { force: true });

    const rewrittenFiles = repointReferences(markdownFiles, from, to);
    converted.push({
      from,
      to,
      beforeBytes,
      afterBytes: out.length,
      rewrittenFiles,
    });
  }

  return { converted };
}

async function main(): Promise<void> {
  const { converted } = await optimizeImages();
  if (converted.length === 0) {
    console.log("images:optimize: every image is already WebP, nothing to do.");
    return;
  }
  let saved = 0;
  for (const c of converted) {
    const beforeKb = Math.round(c.beforeBytes / 1024);
    const afterKb = Math.round(c.afterBytes / 1024);
    saved += c.beforeBytes - c.afterBytes;
    console.log(`${c.from} -> ${c.to}: ${beforeKb}KB -> ${afterKb}KB`);
    for (const f of c.rewrittenFiles) console.log(`  -> repointed ${f}`);
    if (c.rewrittenFiles.length === 0) {
      console.log(`  -> nothing referenced ${c.from} (converted anyway)`);
    }
  }
  console.log(
    `images:optimize: ${converted.length} converted, ${Math.round(saved / 1024)}KB saved.`,
  );
}

// Only run when invoked directly, so the tests can import the function.
if (process.argv[1] && basename(process.argv[1]).startsWith("optimize-images")) {
  void main();
}
