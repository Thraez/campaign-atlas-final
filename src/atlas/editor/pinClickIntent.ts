// src/atlas/editor/pinClickIntent.ts
export type PinClickIntent =
  | { kind: "place-anchor" }
  | { kind: "open-entity"; entityId: string };

export function resolvePinClickIntent(
  args: { pending: boolean; entityId: string },
): PinClickIntent {
  if (args.pending) return { kind: "place-anchor" };
  return { kind: "open-entity", entityId: args.entityId };
}
