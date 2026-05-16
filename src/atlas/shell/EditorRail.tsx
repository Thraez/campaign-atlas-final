import { Fragment } from "react";
import type { RailItem, RailGroup } from "./railRegistry";

const GROUP_ORDER: RailGroup[] = ["content", "map", "system"];

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
        return (
          <Fragment key={group}>
            {gi > 0 && (
              <div
                data-testid={`rail-divider-${group}`}
                className={`mx-3 my-1 border-t ${isSystem ? "mt-auto" : ""}`}
              />
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
          </Fragment>
        );
      })}
    </nav>
  );
}
