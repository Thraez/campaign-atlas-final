import { useCallback, useRef, useState } from "react";
import { computePeekPosition, type PeekPosition } from "./computePeekPosition";

const OPEN_DELAY = 200;
const CLOSE_GRACE = 80;
const COOLING = 400;
const CARD = { width: 240, height: 130 };

export interface PeekState { entityId: string; position: PeekPosition }

export function usePeekController({ pointerFine }: { pointerFine: boolean }) {
  const [peek, setPeek] = useState<PeekState | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const coolingUntil = useRef(0);
  const startPt = useRef<{ x: number; y: number } | null>(null);

  const clearOpen = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const show = useCallback((entityId: string, rect: DOMRect) => {
    const position = computePeekPosition(rect, { width: window.innerWidth, height: window.innerHeight }, CARD);
    setPeek({ entityId, position });
  }, []);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = window.setTimeout(() => { setPeek(null); coolingUntil.current = Date.now() + COOLING; }, CLOSE_GRACE);
  }, []);

  const onTriggerEnter = useCallback((entityId: string, rect: DOMRect, start?: { x: number; y: number }) => {
    if (!pointerFine) return;
    if (Date.now() < coolingUntil.current) return;
    clearClose();
    if (peek) { show(entityId, rect); return; }
    clearOpen();
    startPt.current = start ?? null;
    openTimer.current = window.setTimeout(() => show(entityId, rect), OPEN_DELAY);
  }, [pointerFine, peek, show]);

  const onPointerMove = useCallback((pt: { x: number; y: number }) => {
    if (!openTimer.current || !startPt.current) return;
    if (Math.hypot(pt.x - startPt.current.x, pt.y - startPt.current.y) > 5) clearOpen();
  }, []);

  const onTriggerLeave = useCallback(() => { clearOpen(); scheduleClose(); }, [scheduleClose]);
  const onCardEnter = useCallback(() => clearClose(), []);
  const onCardLeave = useCallback(() => scheduleClose(), [scheduleClose]);
  const dismiss = useCallback(() => { clearOpen(); clearClose(); setPeek(null); coolingUntil.current = Date.now() + COOLING; }, []);

  const tapPeek = useCallback((entityId: string, rect: DOMRect): string => {
    if (peek?.entityId === entityId) { setPeek(null); return entityId; }
    show(entityId, rect);
    return "";
  }, [peek, show]);

  return { peek, onTriggerEnter, onTriggerLeave, onCardEnter, onCardLeave, onPointerMove, dismiss, show, tapPeek };
}
