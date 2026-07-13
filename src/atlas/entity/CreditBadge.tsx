import React from "react";

interface CreditBadgeProps {
  credit: string;
  /**
   * "corner" (default): absolutely positioned bottom-right of a `relative`
   * parent — the entity-thumbnail / lightbox pattern, one badge per image box.
   * "static": flows in normal layout so several badges can stack inside a
   * flex container — the map's viewport-corner overlay, which combines
   * several active layer credits. Same visual look either way.
   */
  variant?: "corner" | "static";
}

/**
 * Faint corner credit badge. Resting opacity ~0.45; full opacity on hover/focus.
 * pointer-events limited to the badge so a parent thumb-click still opens the lightbox.
 */
export function CreditBadge({ credit, variant = "corner" }: CreditBadgeProps) {
  const className =
    variant === "static" ? "atlas-credit-badge atlas-credit-badge--static" : "atlas-credit-badge";
  return (
    <div className={className} title={credit} aria-label={`Image credit: ${credit}`} role="note">
      {credit}
    </div>
  );
}
