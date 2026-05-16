// src/atlas/shell/railRegistry.tsx
import type { ReactNode } from "react";
import {
  Users, MapPin, Flag, ScrollText, Package, BookOpen,
  Pin as PinIcon, Shapes, Route, CloudFog,
  Save as SaveIcon, ShieldCheck,
} from "lucide-react";

export type RailGroup = "content" | "map" | "system";

export interface RailItem {
  id: string;
  group: RailGroup;
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Returns a count to show as a badge, or undefined for none. */
  badge?: () => number | undefined;
  /** The panel React node rendered in the flyout host when active. */
  panel?: ReactNode;
}

export interface BuildRailArgs {
  /** Per-id panel nodes supplied by the editor (kept out of the registry so the registry stays declarative/testable). */
  panels: Record<string, ReactNode>;
  /** Per-id badge counts (already computed by the editor). */
  counts: Record<string, number | undefined>;
}

const ICON = "h-4 w-4";

export function buildRailItems({ panels, counts }: BuildRailArgs): RailItem[] {
  const mk = (
    id: string, group: RailGroup, label: string,
    icon: ReactNode, shortcut?: string,
  ): RailItem => ({
    id, group, label, shortcut, icon,
    badge: () => counts[id],
    panel: panels[id],
  });
  return [
    mk("characters", "content", "Characters", <Users className={ICON} />, "1"),
    mk("locations", "content", "Locations", <MapPin className={ICON} />, "2"),
    mk("factions", "content", "Factions", <Flag className={ICON} />, "3"),
    mk("events", "content", "Events", <ScrollText className={ICON} />, "4"),
    mk("items", "content", "Items", <Package className={ICON} />, "5"),
    mk("lore", "content", "Lore", <BookOpen className={ICON} />, "6"),
    mk("pins", "map", "Pins", <PinIcon className={ICON} />, "P"),
    mk("regions", "map", "Regions", <Shapes className={ICON} />, "R"),
    mk("routes", "map", "Routes", <Route className={ICON} />, "T"),
    mk("fog", "map", "Fog", <CloudFog className={ICON} />, "F"),
    mk("save", "system", "Save", <SaveIcon className={ICON} />, "Ctrl+S"),
    mk("publish", "system", "Publish", <ShieldCheck className={ICON} />),
  ];
}
