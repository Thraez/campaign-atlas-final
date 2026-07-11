export interface AnchorRect { top: number; bottom: number; left: number; right: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface PeekPosition { left: number; top: number; placement: "above" | "below" }

export function computePeekPosition(anchor: AnchorRect, viewport: Size, card: Size, gap = 8): PeekPosition {
  const roomBelow = viewport.height - anchor.bottom;
  const below = roomBelow >= card.height + gap;
  const top = below ? anchor.bottom + gap : anchor.top - gap - card.height;
  const rawLeft = anchor.left;
  const left = Math.max(gap, Math.min(rawLeft, viewport.width - card.width - gap));
  return { left, top, placement: below ? "below" : "above" };
}
