/**
 * Open a self-contained, print-ready window for one or many atlas entities
 * and trigger the browser print dialog. Users can choose "Save as PDF" to
 * produce a player handout (single entity) or a session bundle (many).
 *
 * We render an isolated HTML doc instead of printing the live app so map
 * chrome, sidebars, and toolbars never bleed into the output. The HTML
 * builder is pure (no DOM, no window) so it can be unit tested.
 */
import { toast } from "sonner";
import type { AssetCredit, CreditsConfig, Entity } from "./content/schema";
import { playerTypeLabel } from "./content/typeLabel";
import { normalizeAtlasAssetUrl } from "./url";
import { resolveImageCredit } from "./content/imageCredit";

const EMPTY_ENTITIES: Map<string, Entity> = new Map();

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );

const HANDOUT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Georgia, "Times New Roman", serif; line-height: 1.55; }
  .handout { max-width: 720px; margin: 0 auto; padding: 8px 0 24px; }
  .handout + .handout { padding-top: 0; }
  .handout.page-break { page-break-after: always; }
  header.handout-head { border-bottom: 2px solid #b08d3a; padding-bottom: 12px; margin-bottom: 18px; }
  .kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; color: #8a6a1f; font-family: "Helvetica Neue", Arial, sans-serif; }
  h1.handout-title { font-family: "Cinzel", Georgia, serif; font-size: 30px; margin: 4px 0 0; color: #1a1a1a; }
  .aliases { font-size: 12px; color: #555; margin: 4px 0 0; font-style: italic; }
  .summary { font-size: 14px; font-style: italic; color: #444; border-left: 3px solid #b08d3a; padding-left: 10px; margin: 14px 0; }
  .hero { width: 100%; max-height: 320px; object-fit: cover; border-radius: 4px; margin: 0; display: block; }
  .hero-credit { font-size: 9px; color: #888; font-style: italic; text-align: right; margin: 2px 0 16px; font-family: "Helvetica Neue", Arial, sans-serif; }
  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 12px 0 18px; page-break-inside: avoid; }
  .gallery figure { margin: 0; }
  .gallery img { width: 100%; height: 110px; object-fit: cover; border-radius: 3px; display: block; }
  .gallery figcaption { font-size: 8px; color: #888; font-style: italic; text-align: center; margin-top: 2px; font-family: "Helvetica Neue", Arial, sans-serif; }
  .body p { margin: 0.6em 0; }
  .body h1, .body h2, .body h3 { font-family: "Cinzel", Georgia, serif; color: #1a1a1a; margin: 1.2em 0 0.3em; }
  .body h1 { font-size: 22px; } .body h2 { font-size: 18px; } .body h3 { font-size: 15px; }
  .body blockquote { border-left: 3px solid #b08d3a; margin: 0.8em 0; padding: 0.1em 0 0.1em 12px; color: #555; font-style: italic; }
  .body ul, .body ol { padding-left: 1.4em; margin: 0.5em 0; }
  .body a, .body a.atlas-wikilink { color: #5d4a1a; text-decoration: none; border-bottom: 1px dotted #b08d3a; }
  .connections { margin-top: 18px; border-top: 1px solid #e0d4b0; padding-top: 12px; }
  .conn-heading { font-family: "Cinzel", Georgia, serif; font-size: 15px; color: #1a1a1a; margin: 0 0 8px; }
  .connections ul { margin: 0; padding-left: 1.2em; font-size: 13px; }
  .connections li { margin-bottom: 3px; }
  .conn-label { color: #8a6a1f; font-style: italic; }
  .tags { margin-top: 18px; font-size: 11px; color: #6c6c6c; font-family: "Helvetica Neue", Arial, sans-serif; }
  .tags span { display: inline-block; margin-right: 8px; }
  .body .footnotes { margin-top: 1.4em; border-top: 1px solid #e0d4b0; padding-top: 10px; font-size: 12px; color: #555; }
  .body .footnotes ol { padding-left: 1.3em; margin: 0; }
  .body .footnotes li { margin-bottom: 4px; }
  .body a.footnote-ref { color: #8a6a1f; text-decoration: none; font-size: 0.75em; }
  .body a.footnote-backref { color: #888; text-decoration: none; margin-left: 4px; }
  footer.handout-foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #888; font-family: "Helvetica Neue", Arial, sans-serif; display: flex; justify-content: space-between; }
  .body img { max-width: 100%; height: auto; }
  .empty { padding: 40px 20px; text-align: center; color: #666; font-style: italic; }
  @media print {
    .no-print { display: none !important; }
    a { color: inherit; text-decoration: none; border-bottom: none; }
  }
  .no-print { position: fixed; top: 12px; right: 12px; z-index: 10; }
  .no-print button { font: 12px "Helvetica Neue", Arial, sans-serif; padding: 6px 12px; background: #1a1a1a; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 6px; }
`;

/** The footnote extension (`markdownCore.ts`) scopes ids only by the
 *  footnote's own label (`fnref-{id}` / `fn-{id}`), which is fine for a
 *  single rendered entity but collides when several entities' bodyHtml are
 *  concatenated into one bundle and happen to share a label. Rewrite those
 *  ids/hrefs to be unique per entity position in the bundle. */
function scopeFootnoteIds(html: string, scope: number): string {
  return html
    .replace(/id="fnref-([^"]+)"/g, `id="fnref-${scope}-$1"`)
    .replace(/href="#fnref-([^"]+)"/g, `href="#fnref-${scope}-$1"`)
    .replace(/id="fn-([^"]+)"/g, `id="fn-${scope}-$1"`)
    .replace(/href="#fn-([^"]+)"/g, `href="#fn-${scope}-$1"`);
}

/** Render one entity as a self-contained <article>. Page break is applied by
 *  the caller (so the last entity in a bundle doesn't get a trailing blank). */
function renderEntitySection(
  entity: Entity,
  withPageBreak: boolean,
  entitiesById: Map<string, Entity>,
  scope: number,
  assetCredits: Record<string, AssetCredit> | undefined,
  showCredits: boolean,
): string {
  const creditFor = (src: string): string | null =>
    showCredits ? resolveImageCredit(src, assetCredits, entity.credit) : null;
  const heroImg = entity.images[0] ? normalizeAtlasAssetUrl(entity.images[0]) : null;
  const heroCredit = entity.images[0] ? creditFor(entity.images[0]) : null;
  const galleryImgs = entity.images.slice(1).map((src) => ({
    url: normalizeAtlasAssetUrl(src),
    credit: creditFor(src),
  }));
  const tagsHtml = entity.tags.length
    ? `<div class="tags">${entity.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  const aliases = entity.aliases.length
    ? `<p class="aliases">Also known as ${escapeHtml(entity.aliases.join(", "))}</p>`
    : "";
  const summary = entity.summary ? `<p class="summary">${escapeHtml(entity.summary)}</p>` : "";
  // entity.bodyHtml is sanitized server-side at build time and contains
  // <a class="atlas-wikilink"> tokens; render as-is for the handout, except
  // for footnote ids/hrefs, which are scoped per entity to avoid collisions
  // when this section is concatenated into a multi-entity bundle.
  const body = entity.bodyHtml
    ? scopeFootnoteIds(entity.bodyHtml, scope)
    : `<p>${escapeHtml(entity.body || "")}</p>`;
  const cls = withPageBreak ? "handout page-break" : "handout";
  const connectionsHtml = entity.relationships?.length
    ? `<div class="connections"><h2 class="conn-heading">Connections</h2><ul>${entity.relationships
        .map((r) => {
          const label = escapeHtml(r.label ?? r.type);
          const target = entitiesById.get(r.entity);
          const targetTitle = escapeHtml(target?.title ?? r.entity);
          return `<li><span class="conn-label">${label}:</span> ${targetTitle}</li>`;
        })
        .join("")}</ul></div>`
    : "";

  return `<article class="${cls}">
    <header class="handout-head">
      ${(() => {
        const label = playerTypeLabel(entity.type);
        const kicker = [label, entity.race].filter(Boolean).join(" · ");
        return kicker ? `<div class="kicker">${escapeHtml(kicker)}</div>` : "";
      })()}
      <h1 class="handout-title">${escapeHtml(entity.title)}</h1>
      ${aliases}
    </header>
    ${heroImg ? `<img class="hero" src="${escapeHtml(heroImg)}" alt="${escapeHtml(entity.title)}" />` : ""}
    ${heroImg && heroCredit ? `<div class="hero-credit">${escapeHtml(heroCredit)}</div>` : ""}
    ${summary}
    <div class="body">${body}</div>
    ${
      galleryImgs.length
        ? `<div class="gallery">${galleryImgs
            .map(
              (img) =>
                `<figure><img src="${escapeHtml(img.url)}" alt="" />${img.credit ? `<figcaption>${escapeHtml(img.credit)}</figcaption>` : ""}</figure>`,
            )
            .join("")}</div>`
        : ""
    }
    ${connectionsHtml}
    ${tagsHtml}
    <footer class="handout-foot">
      <span>Astrath Atlas — player handout</span>
      <span>${new Date().toLocaleDateString()}</span>
    </footer>
  </article>`;
}

/** Pure builder for the print-window HTML. Exported for testing. */
export function buildHandoutHtml(
  entities: Entity[],
  entitiesById: Map<string, Entity> = EMPTY_ENTITIES,
  assetCredits?: Record<string, AssetCredit>,
  credits?: CreditsConfig,
): string {
  const docTitle =
    entities.length === 0
      ? "Atlas handout"
      : entities.length === 1
        ? `${entities[0].title} — Astrath Atlas handout`
        : `${entities.length} entities — Astrath Atlas handout bundle`;

  const showCredits = credits?.badges !== false;

  const sections =
    entities.length === 0
      ? `<div class="empty">No entities selected for this handout.</div>`
      : entities
          .map((e, i) =>
            renderEntitySection(e, i < entities.length - 1, entitiesById, i, assetCredits, showCredits),
          )
          .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>${HANDOUT_CSS}</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${sections}
  <script>
    // Wait for fonts + images to settle before opening the print dialog
    // so the saved PDF includes hero images and Cinzel headings.
    (function(){
      var fired = false;
      function go(){ if (fired) return; fired = true; setTimeout(function(){ window.focus(); window.print(); }, 250); }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go);
      }
      window.addEventListener('load', go);
    })();
  </script>
</body>
</html>`;
}

function openPrintWindow(html: string): boolean {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!w) {
    toast.error("Pop-ups are blocked. Please allow pop-ups for this site to download the handout.");
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function printEntityHandout(
  entity: Entity,
  entitiesById: Map<string, Entity> = EMPTY_ENTITIES,
  assetCredits?: Record<string, AssetCredit>,
  credits?: CreditsConfig,
): boolean {
  return openPrintWindow(buildHandoutHtml([entity], entitiesById, assetCredits, credits));
}

/** Print a bundle of entities as a single PDF, one entity per page. */
export function printEntityBundle(
  entities: Entity[],
  assetCredits?: Record<string, AssetCredit>,
  credits?: CreditsConfig,
): boolean {
  return openPrintWindow(buildHandoutHtml(entities, EMPTY_ENTITIES, assetCredits, credits));
}
