/** CSS class suffix used to render a pin filled (discovered) or hollow (not yet). */
export function pinDiscoveryClass(entityId: string, visited: Set<string>): string {
  return visited.has(entityId) ? "atlas-pin--discovered" : "atlas-pin--undiscovered";
}
