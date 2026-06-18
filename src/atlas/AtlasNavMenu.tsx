import { Link } from "react-router-dom";
import { Menu, Compass, LayoutGrid, CalendarClock, MapPin, Star, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { isDmToolsEnabled } from "@/atlas/dmTools";

interface AtlasNavMenuProps {
  /** When provided, shown as "Updated <date>" in the menu footer. */
  publishedAt?: string;
  /** Optional footer slot — e.g. the OfflineStatus controls. */
  footer?: React.ReactNode;
  /** When true, show the Credits nav link. Only shown when credits.page is on AND ≥1 credit exists. */
  showCredits?: boolean;
}

/**
 * Hamburger nav surface used at every viewport below the desktop-aside
 * breakpoint (lg). Replaces the inline toolbar Browse/Timeline/Edit-pins
 * buttons on tablet + mobile so all routes have a consistent escape path.
 *
 * Embedded in the toolbar of `AtlasViewer`, `AtlasBrowse`, `AtlasTimeline`
 * with `lg:hidden` so it disappears once the inline buttons fit naturally.
 */
export function AtlasNavMenu({ publishedAt, footer, showCredits }: AtlasNavMenuProps) {
  const editorEnabled = __INCLUDE_EDITOR__ && isDmToolsEnabled();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden -ml-1" aria-label="Open navigation menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border text-left">
          <SheetTitle className="flex items-center gap-2 font-display text-lg text-primary">
            <Compass className="h-5 w-5" aria-hidden="true" /> Astrath Atlas
          </SheetTitle>
          <SheetDescription className="sr-only">Atlas navigation menu</SheetDescription>
        </SheetHeader>
        <nav className="flex-1 p-2 space-y-1" aria-label="Atlas navigation">
          <NavItem to="/atlas" icon={MapPin} label="Map" />
          <NavItem to="/atlas/browse" icon={LayoutGrid} label="Browse" />
          <NavItem to="/atlas/timeline" icon={CalendarClock} label="Timeline" />
          {showCredits && (
            <NavItem to="/atlas/credits" icon={Star} label="Credits" />
          )}
          {editorEnabled && (
            <NavItem to="/atlas/edit" icon={MapPin} label="Edit pins" badge="DM" />
          )}
        </nav>
        {(publishedAt || footer) && (
          <div className="px-4 py-3 border-t border-border space-y-2">
            {footer}
            {publishedAt && (
              <div className="text-[11px] text-muted-foreground">
                Updated {new Date(publishedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden={true} />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted border border-border">
          {badge}
        </span>
      )}
    </Link>
  );
}
