/**
 * The Map Import Wizard's download: patch, README and the image files at
 * their target paths. Every image goes through the dev server's
 * `/__atlas/clean-asset` first, the same metadata strip `/__atlas/save` runs
 * on an editor upload (eval-2026-10/29, /48): a JPG map loses EXIF/XMP/IPTC
 * with its image data kept byte for byte, and the same refusals apply (EXIF
 * orientation other than normal, a JPG under a non-.jpg name). Editor-only.
 */
import JSZip from "jszip";
import { DEV_API_PATHS } from "../../../scripts/atlas/devRoutes";

/** Shown when the route isn't there: the wizard opened outside `npm run dev`. */
export const NEEDS_DEV_SERVER = "Map cleaning needs the editor's dev server (npm run dev)";

export type CleanedAsset =
  { ok: true; base64: string } | { ok: false; reason: string; detail: string };

/** Cleans one image for `targetPath`; `dataUrl` is the file as picked. */
export type CleanAsset = (targetPath: string, dataUrl: string) => Promise<CleanedAsset>;

export type MapImportZipResult =
  { ok: true; zip: JSZip } | { ok: false; path: string; reason: string; detail: string };

/** Reads a `/__atlas/clean-asset` reply: 200 `{ base64 }`, else `{ error, reason?, detail? }`. */
export function readCleanAssetReply(status: number, body: unknown): CleanedAsset {
  if (status === 404) return { ok: false, reason: "no-dev-server", detail: NEEDS_DEV_SERVER };
  const o = (body ?? {}) as {
    base64?: unknown;
    error?: unknown;
    reason?: unknown;
    detail?: unknown;
  };
  if (status === 200 && typeof o.base64 === "string") return { ok: true, base64: o.base64 };
  const reason =
    typeof o.reason === "string" ? o.reason : typeof o.error === "string" ? o.error : "failed";
  const detail = typeof o.detail === "string" ? o.detail : `HTTP ${status} (${reason})`;
  return { ok: false, reason, detail };
}

/** `fetchFn` defaults to the global `fetch`, looked up at call time. */
export function cleanAssetViaDevServer(
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): CleanAsset {
  return async (targetPath, dataUrl) => {
    const resp = await fetchFn(DEV_API_PATHS.cleanAsset, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath, content: dataUrl }),
    }).catch(() => null);
    if (!resp) return { ok: false, reason: "no-dev-server", detail: NEEDS_DEV_SERVER };
    return readCleanAssetReply(resp.status, await resp.json().catch(() => ({})));
  };
}

/**
 * The zip, or the first asset the strip refused (nothing is built then: a
 * package missing one of its maps would apply as a broken world.yaml).
 */
export async function buildMapImportZip(
  files: { patch: string; readme: string },
  assets: ReadonlyArray<{ targetPath: string; dataUrl: string }>,
  clean: CleanAsset,
): Promise<MapImportZipResult> {
  const zip = new JSZip();
  zip.file("world-map-patch.yaml", files.patch);
  zip.file("README-apply-map-import.md", files.readme);
  for (const a of assets) {
    const cleaned = await clean(a.targetPath, a.dataUrl);
    if (!cleaned.ok) {
      return { ok: false, path: a.targetPath, reason: cleaned.reason, detail: cleaned.detail };
    }
    zip.file(a.targetPath, cleaned.base64, { base64: true });
  }
  return { ok: true, zip };
}
