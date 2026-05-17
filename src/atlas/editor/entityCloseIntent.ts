export type EntityCloseIntent =
  | { kind: "close" }
  | { kind: "confirm-discard" };

export function resolveEntityCloseIntent(args: { dirty: boolean }): EntityCloseIntent {
  return args.dirty ? { kind: "confirm-discard" } : { kind: "close" };
}
