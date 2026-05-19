import { useRef } from "react";
import type { AutocompleteContext, EntitySuggestion } from "./wikilinkAutocomplete";

interface WikilinkPopoverProps {
  ctx: AutocompleteContext;
  /** For entity context: filtered entity suggestions. */
  entityItems: EntitySuggestion[];
  /** For image context: filtered image filenames. */
  imageItems: string[];
  activeIndex: number;
  onSelect: (label: string) => void;
  onImportImage: (file: File) => void;
}

/**
 * Autocomplete dropdown for `[[` (entity) and `![[` (image) triggers.
 * Rendered in a `position: relative` wrapper just below the body textarea.
 * Keyboard navigation (ArrowUp/Down, Enter, Escape, Tab) is handled by the
 * parent textarea's onKeyDown — this component is purely display.
 */
export function WikilinkPopover({
  ctx,
  entityItems,
  imageItems,
  activeIndex,
  onSelect,
  onImportImage,
}: WikilinkPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEntity = ctx.type === "entity";
  const items: Array<{ label: string; sublabel?: string; value: string }> = isEntity
    ? entityItems.map((e) => ({ label: e.title, sublabel: e.type, value: e.id }))
    : imageItems.map((name) => ({ label: name, value: name }));

  const clampedIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportImage(file);
    // reset so the same filename can be picked again
    e.target.value = "";
  };

  return (
    <div
      className="absolute z-50 left-0 right-0 top-full mt-0.5 rounded border bg-background shadow-lg text-xs overflow-hidden"
      role="listbox"
      aria-label={isEntity ? "Entity suggestions" : "Image suggestions"}
    >
      {items.length === 0 && (
        <div className="px-2 py-1.5 text-muted-foreground italic">No matches</div>
      )}
      {items.map((item, i) => (
        <div
          key={item.value}
          role="option"
          aria-selected={i === clampedIndex}
          className={`flex items-baseline gap-2 px-2 py-1 cursor-pointer select-none ${
            i === clampedIndex
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
          onMouseDown={(e) => {
            // prevent textarea blur before onSelect fires
            e.preventDefault();
            onSelect(item.value);
          }}
        >
          <span className="truncate">{item.label}</span>
          {item.sublabel && (
            <span
              className={`shrink-0 ${i === clampedIndex ? "opacity-70" : "text-muted-foreground"}`}
            >
              {item.sublabel}
            </span>
          )}
        </div>
      ))}
      {!isEntity && (
        <div className="border-t">
          <button
            type="button"
            className="w-full text-left px-2 py-1 hover:bg-muted text-primary"
            onMouseDown={(e) => {
              e.preventDefault();
              fileInputRef.current?.click();
            }}
          >
            Import image…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
