import { Fragment } from "react";
import type { RailItem, RailGroup } from "./railRegistry";

const GROUP_ORDER: RailGroup[] = ["content", "map", "system"];

/**
 * Visible heading per group. The rail already drew hairline dividers between
 * groups, but a hairline alone doesn't say what the groups ARE — and it is
 * invisible to assistive tech, which read the rail as one flat list of buttons.
 * `null` means "divider only": the trailing utilities aren't a category so much
 * as everything else.
 */
const GROUP_LABELS: Record<RailGroup, string | null> = {
  content: "Your world",
  map: "On the map",
  system: null,
};

export function EditorRail({
  items,
  activeId,
  onSelect,
}: {
  items: RailItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      className="flex flex-col items-stretch w-[64px] shrink-0 border-r bg-background py-2 overflow-y-auto"
      aria-label="Editor sections"
    >
      {GROUP_ORDER.map((group, gi) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        const isSystem = group === "system";
        const heading = GROUP_LABELS[group];
        return (
          <Fragment key={group}>
            {gi > 0 && (
              <div
                data-testid={`rail-divider-${group}`}
                className={`mx-3 my-1 border-t ${isSystem ? "mt-auto" : ""}`}
              />
            )}
            {/* role=group + a real accessible name: the hairline divider carries
                no meaning for a screen reader, which previously read the whole
                rail as one undifferentiated list of buttons. */}
            <div
              role="group"
              aria-label={heading ?? "Other tools"}
              className="flex flex-col items-stretch"
            >
              {heading && (
                // aria-hidden: the group's aria-label already announces this,
                // and a heading here would inject itself into the page outline.
                <div
                  aria-hidden
                  className="px-1 pt-1 pb-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70 text-center"
                >
                  {heading}
                </div>
              )}
              {groupItems.map((it) => {
                const count = it.badge?.();
                const active = activeId === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    title={it.shortcut ? `${it.label} (${it.shortcut})` : it.label}
                    aria-label={it.label}
                    aria-pressed={active}
                    onClick={() => onSelect(it.id)}
                    className={`relative flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] leading-tight
                      ${
                        active
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <span aria-hidden>{it.icon}</span>
                    <span className="truncate w-full text-center">{it.label}</span>
                    {typeof count === "number" && count > 0 && (
                      <span className="absolute top-1 right-2 rounded-full bg-primary text-primary-foreground text-[9px] px-1">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}
