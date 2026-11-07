import type { ReactNode } from "react";

interface FilterChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  /** "tag" is the quieter, mixed-case chip used for #tags. */
  variant?: "type" | "tag";
  title?: string;
  /** Extra layout classes, e.g. for a chip with an icon. */
  className?: string;
}

const LOOK = {
  type: {
    base: "text-[10px] uppercase tracking-wider filter-chip px-2 py-0.5 rounded",
    on: "bg-primary text-primary-foreground",
    off: "bg-muted hover:bg-accent",
  },
  tag: {
    base: "text-[10px] filter-chip px-2 py-0.5 rounded",
    on: "bg-secondary text-secondary-foreground",
    off: "bg-muted/60 hover:bg-accent",
  },
} as const;

/**
 * A toggleable filter chip (Timeline, Browse, SearchPalette). `aria-pressed`
 * carries the selected state so it isn't shown by colour alone.
 */
export function FilterChip({
  pressed,
  onClick,
  children,
  variant = "type",
  title,
  className,
}: FilterChipProps) {
  const look = LOOK[variant];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={`${look.base}${className ? ` ${className}` : ""} ${pressed ? look.on : look.off}`}
    >
      {children}
    </button>
  );
}
