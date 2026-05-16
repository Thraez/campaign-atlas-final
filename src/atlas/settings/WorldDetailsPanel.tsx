// src/atlas/settings/WorldDetailsPanel.tsx
export interface WorldDetails { name?: string; }

export function WorldDetailsPanel({
  world, onPatch,
}: {
  world: WorldDetails;
  onPatch: (p: Partial<WorldDetails>) => void;
}) {
  return (
    <div className="p-3 space-y-3 text-xs">
      <label className="block">
        <span className="block mb-1">World name</span>
        <input
          aria-label="World name"
          className="w-full h-8 px-2 rounded border bg-background"
          defaultValue={world.name ?? ""}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        <span className="block mt-1 text-muted-foreground">
          Shown as the title across the editor and the player site.
        </span>
      </label>
    </div>
  );
}
