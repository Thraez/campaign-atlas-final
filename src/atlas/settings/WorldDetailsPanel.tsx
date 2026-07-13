// src/atlas/settings/WorldDetailsPanel.tsx
import type { CreditsConfig } from "@/atlas/content/schema";

export interface WorldDetails {
  name?: string;
  /** Site-wide credit switches. Both default to true when unset. */
  credits?: CreditsConfig;
}

export function WorldDetailsPanel({
  world,
  onPatch,
}: {
  world: WorldDetails;
  onPatch: (p: Partial<WorldDetails>) => void;
}) {
  // badges/page default to ON when unset (see CreditsConfig).
  const badgesOn = world.credits?.badges !== false;
  const pageOn = world.credits?.page !== false;
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

      <fieldset className="space-y-2 border-t pt-3">
        <legend className="mb-1 font-medium">Credits</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Show credit badges"
            checked={badgesOn}
            onChange={(e) => onPatch({ credits: { ...world.credits, badges: e.target.checked } })}
          />
          <span>Show credit badges on images</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Publish credits page"
            checked={pageOn}
            onChange={(e) => onPatch({ credits: { ...world.credits, page: e.target.checked } })}
          />
          <span>Publish the credits page</span>
        </label>
        <span className="block text-muted-foreground">
          Site-wide switches for image attribution. Turn badges off to hide every credit at once.
        </span>
      </fieldset>
    </div>
  );
}
