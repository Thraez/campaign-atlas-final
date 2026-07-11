import React from "react";

interface CreditBadgeProps {
  credit: string;
}

/**
 * Faint corner credit badge rendered bottom-right over each entity image.
 * Resting opacity ~0.45; full opacity on hover/focus.
 * pointer-events limited to the badge so the parent thumb-click still opens the lightbox.
 */
export function CreditBadge({ credit }: CreditBadgeProps) {
  return (
    <div
      className="atlas-credit-badge"
      title={credit}
      aria-label={`Image credit: ${credit}`}
      role="note"
    >
      {credit}
    </div>
  );
}
