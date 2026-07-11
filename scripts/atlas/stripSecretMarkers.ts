/** Removes {{secret:id}} reference markers from body text before it ships to players. */
export function stripSecretMarkers(s: string): string {
  return s.replace(/\{\{secret:[^}]+\}\}/g, "");
}
