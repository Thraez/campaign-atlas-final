import type { PlayerSecret } from "@/atlas/content/schema";
import { revealToHtml } from "./revealSecret";
import { getCharacterKey, markUnlocked } from "./playerSecretsStore";

function injectSafe(host: HTMLElement, safeHtml: string): void {
  // safeHtml is always output of sanitizeAtlasHtml — safe to parse into DOM nodes
  const frag = document.createRange().createContextualFragment(safeHtml);
  host.replaceChildren(frag);
}

/**
 * Renders one placeholder <span data-secret-id> into either a sealed box
 * (password) or the character owner's reveal (character lock).
 * Called as an imperative DOM post-pass after React renders bodyHtml.
 */
export function mountSecretBlock(host: HTMLElement, secret: PlayerSecret): void {
  host.replaceChildren();
  host.classList.add("atlas-secret");

  const showReveal = (safeHtml: string) => {
    const open = document.createElement("div");
    open.className = "atlas-secret-open";
    injectSafe(open, safeHtml);
    host.replaceChildren(open);
  };

  if (secret.lockType === "character") {
    const key = getCharacterKey();
    if (!key) {
      // Invisible until the character owner signs in with their key
      host.replaceChildren();
      return;
    }
    void revealToHtml(secret, key).then((html) => {
      if (html) showReveal(html);
      else host.replaceChildren();
    });
    return;
  }

  // password: a visible sealed box with teaser + passphrase input
  const box = document.createElement("div");
  box.className = "atlas-secret-sealed";

  if (secret.teaser) {
    const t = document.createElement("div");
    t.className = "atlas-secret-teaser";
    t.textContent = secret.teaser; // text node — no HTML parsing
    box.appendChild(t);
  }

  const form = document.createElement("form");
  form.className = "atlas-secret-form";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "atlas-secret-input";
  input.placeholder = "Speak the words…";
  input.setAttribute("aria-label", "Secret passphrase");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Unseal";
  const msg = document.createElement("div");
  msg.className = "atlas-secret-msg";
  msg.setAttribute("role", "status");
  form.append(input, submit);
  box.append(form, msg);
  host.replaceChildren(box);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void revealToHtml(secret, input.value).then((html) => {
      if (html) {
        markUnlocked(secret.id);
        showReveal(html);
      } else {
        msg.textContent = "The seal holds firm.";
      }
    });
  });
}
