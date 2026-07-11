/**
 * Sound tab — the DM's soundscape authoring panel (Phase 1b).
 *
 * Modelled on RegionsTab + MapSettingsPanel: the DM can give an existing
 * region a sound (ride-on area), draw a sound-only zone on the map, pick an
 * audio file per area, and set Volume (whole map) / Loudness (per area).
 * All draft state lives in `useSoundscapeDraft` so this panel and the on-map
 * `SoundAreaLayer` stay in sync when they share one instance.
 *
 * Persistence: on every mutation the panel writes the merged config back via
 * `onPatch({ soundscape: soundAreaDraftToConfig(...) })` — the editor's
 * existing `patchMap` seam — so the unified Save carries it into world.yaml
 * through `soundscapeToYamlObject`. No new persistence path.
 *
 * DM-facing labels only: "Volume" (masterGain), "Loudness" (per-area gain),
 * "Sound: choose a file" (file). The word "bed" never appears in the UI.
 *
 * EDITOR-ONLY. Reached solely from AtlasPlacementEditor; never import this
 * from the player runtime (src/atlas/sound/), AtlasViewer, or Landing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, MapPin, Pen, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { EntityVisibility, MapDocument, SoundArea } from "@/atlas/content/schema";
import type { UndoStackAPI } from "@/atlas/useUndoStack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { TabFrame } from "./TabFrame";
import { ValidationChips } from "./ValidationChips";
import {
  useSoundscapeDraft,
  type SoundscapeDraftAPI,
} from "@/atlas/sound-editor/useSoundscapeDraft";
import { soundAreaDraftToConfig } from "@/atlas/sound-editor/soundAreaDraftToConfig";

interface Props {
  map: MapDocument;
  onPatch: (patch: Partial<MapDocument>) => void;
  /** Basenames under atlas/assets/audio/ — empty is fine (free-text fallback). */
  availableAudioFiles: string[];
  undoStack?: UndoStackAPI;
  /** Inject the editor-shared draft instance so the on-map layer stays in sync. */
  api?: SoundscapeDraftAPI;
}

/** Schema defaults, surfaced as slider positions (never as raw field names). */
const DEFAULT_VOLUME = 0.6; // SoundscapeConfig.masterGain default
const DEFAULT_LOUDNESS = 0.7; // per-area loudness default

/**
 * De-duplicate areas by id, keeping the LAST occurrence (the draft copy).
 * After a patch feeds back into `map.soundscape`, the canon and the local
 * draft can briefly hold the same area — `useSoundscapeDraft.effective`
 * appends draft-added areas after canon ones, so "last wins" always prefers
 * the freshest local edit.
 */
function dedupeAreas(areas: SoundArea[]): SoundArea[] {
  const byId = new Map<string, SoundArea>();
  for (const a of areas) byId.set(a.id, a);
  return [...byId.values()];
}

export function SoundscapeTab({ map, onPatch, availableAudioFiles, undoStack, api }: Props) {
  // Hooks must run unconditionally; the internal instance simply goes unused
  // when the editor injects its shared one.
  const internal = useSoundscapeDraft(map, undoStack);
  const draft = api ?? internal;
  const {
    effective,
    dirty,
    dirtyCount,
    selectedId,
    setSelectedId,
    drawing,
    draftPoints,
    startDraw,
    cancelDraw,
    finishDraw,
    removeLastDraftPoint,
    addRideOn,
    patchArea,
    patchBed,
    setVisibility,
    setEnabled,
    setMasterGain,
    remove,
    reset,
    issues,
  } = draft;

  const regions = useMemo(() => map.regions ?? [], [map.regions]);
  const [rideOnRegionId, setRideOnRegionId] = useState<string>(regions[0]?.id ?? "");
  const rideOnTarget = regions.find((r) => r.id === rideOnRegionId) ?? regions[0] ?? null;

  const areas = useMemo(() => dedupeAreas(effective.areas ?? []), [effective.areas]);
  const selected = areas.find((a) => a.id === selectedId) ?? null;

  // ---- Persistence: push every local change through the editor's patchMap seam.
  // `soundAreaDraftToConfig` folds the draft into a save-ready config
  // (undefined when there are no areas, which drops `soundscape` from YAML).
  const config = useMemo(() => soundAreaDraftToConfig({ ...effective, areas }), [effective, areas]);
  const configKey = JSON.stringify(config ?? null);
  const canonKey = JSON.stringify(map.soundscape ?? null);
  const sentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dirty) return; // nothing authored locally — never patch on mount
    if (configKey === canonKey) return; // already persisted (patch fed back)
    if (configKey === sentRef.current) return; // this exact config is in flight
    sentRef.current = configKey;
    onPatch({ soundscape: config });
  }, [dirty, configKey, canonKey, config, onPatch]);

  /**
   * Remove an area everywhere it lives. After a patch feeds back, the same id
   * can sit in BOTH the canon map and the draft's `added` list; the hook
   * clears the draft copy first, so a second call marks the canon copy
   * deleted (the hook's draft ref updates synchronously between calls).
   */
  const removeArea = (id: string) => {
    const inAdded = draft.draft.added.some((a) => a.id === id);
    const inCanon = (map.soundscape?.areas ?? []).some((a) => a.id === id);
    remove(id);
    if (inAdded && inCanon) remove(id);
  };

  // Keyboard flow while drawing (copied from RegionsTab): Enter finishes,
  // Esc cancels, Backspace removes the last point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!drawing) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Enter") {
        e.preventDefault();
        finishDraw();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelDraw();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        removeLastDraftPoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, finishDraw, cancelDraw, removeLastDraftPoint]);

  const soundOn = effective.enabled !== false;
  const volumePct = Math.round((effective.masterGain ?? DEFAULT_VOLUME) * 100);

  const areaLabel = (a: SoundArea): string => {
    if (a.name?.trim()) return a.name.trim();
    if (a.regionId) return regions.find((r) => r.id === a.regionId)?.name ?? a.regionId;
    return "Drawn zone";
  };

  const blockingCount = issues.filter((i) => i.severity === "blocking").length;
  const warningCount = issues.length - blockingCount;

  return (
    <TabFrame
      title="Sound"
      builtFromYamlCount={(map.soundscape?.areas ?? []).length}
      localDraftCount={dirtyCount}
      blockingCount={blockingCount}
      warningCount={warningCount}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Changes are saved with the editor's Save button.
        </p>

        {/* Master: on/off + Volume */}
        <div className="rounded-md border border-border p-2.5 space-y-2 bg-card/50">
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">Ambient sound</span>
            <input
              type="checkbox"
              data-testid="sound-toggle"
              checked={soundOn}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </label>
          <div>
            <div className="flex justify-between">
              <Label className="text-[10px]">Volume</Label>
              <span className="text-[10px] text-muted-foreground">{volumePct}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[volumePct]}
              onValueChange={([v]) => setMasterGain(v / 100)}
            />
          </div>
        </div>

        {/* Add: give a region a sound / draw a sound-only zone */}
        {!drawing ? (
          <div className="space-y-1.5">
            <Label className="text-[10px]">Give a region a sound</Label>
            <div className="flex items-center gap-1.5">
              <Select value={rideOnTarget?.id ?? ""} onValueChange={setRideOnRegionId}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Choose a region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!rideOnTarget}
                onClick={() => rideOnTarget && addRideOn(rideOnTarget.id)}
              >
                <Plus className="h-3.5 w-3.5" /> Add sound
              </Button>
            </div>
            {regions.length === 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                No regions on this map yet — draw a sound area instead.
              </p>
            )}
            <Button size="sm" variant="outline" onClick={startDraw} className="h-7 text-xs gap-1">
              <Pen className="h-3.5 w-3.5" /> Draw a sound area
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-primary font-medium px-2 py-1 rounded bg-primary/10">
              Drawing — {draftPoints.length} pt{draftPoints.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                const id = finishDraw();
                if (!id) toast.warning("Need at least 3 points.");
              }}
              className="h-7 text-xs"
            >
              Finish (Enter)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={removeLastDraftPoint}
              className="h-7 text-xs"
            >
              Undo (⌫)
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelDraw} className="h-7 text-xs">
              Cancel (Esc)
            </Button>
          </div>
        )}
        {drawing && (
          <p className="text-[11px] text-muted-foreground italic">
            Click on the map to add points. Enter finishes, Esc cancels, Backspace removes the last
            point. New sound areas start DM-only.
          </p>
        )}
        {dirty && !drawing && (
          <Button size="sm" variant="ghost" onClick={reset} className="h-7 text-xs gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Discard local
          </Button>
        )}

        {/* Validation chips */}
        <ValidationChips issues={issues} onSelect={(i) => i.areaId && setSelectedId(i.areaId)} />

        {/* Sound-area list */}
        <div className="space-y-1">
          {areas.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No sounds yet. Give a region a sound, or draw a sound area on the map.
            </p>
          )}
          {areas.map((a) => {
            const isSelected = a.id === selectedId;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer ${
                  isSelected ? "bg-accent" : "hover:bg-accent/40"
                }`}
                onClick={() => setSelectedId(a.id)}
              >
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs flex-1 truncate">{areaLabel(a)}</span>
                <span className="text-[10px] text-muted-foreground">
                  {a.regionId ? "region" : `${a.points?.length ?? 0} pts`}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            );
          })}
        </div>

        {/* Selected-area form */}
        {selected && (
          <div className="rounded-md border border-border p-2.5 space-y-2.5 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground truncate">
                {selected.id}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-destructive"
                title="Delete"
                onClick={() => removeArea(selected.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div>
              <Label className="text-[10px]">Name</Label>
              <Input
                value={selected.name ?? ""}
                onChange={(e) => patchArea(selected.id, { name: e.target.value })}
                placeholder="Optional label"
                className="h-7 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">Sound: choose a file</Label>
              {availableAudioFiles.length > 0 && (
                <Select
                  value={availableAudioFiles.includes(selected.bed.src) ? selected.bed.src : ""}
                  onValueChange={(v) => patchBed(selected.id, { src: v })}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Choose a file" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAudioFiles.map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                value={selected.bed.src}
                onChange={(e) => patchBed(selected.id, { src: e.target.value })}
                placeholder="file name, e.g. wind.ogg"
                className="h-7 text-xs font-mono"
              />
            </div>

            <div>
              <div className="flex justify-between">
                <Label className="text-[10px]">Loudness</Label>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round((selected.bed.gain ?? DEFAULT_LOUDNESS) * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[Math.round((selected.bed.gain ?? DEFAULT_LOUDNESS) * 100)]}
                onValueChange={([v]) => patchBed(selected.id, { gain: v / 100 })}
              />
            </div>

            {selected.regionId ? (
              <p className="text-[10px] text-muted-foreground italic">
                Follows the region "
                {regions.find((r) => r.id === selected.regionId)?.name ?? selected.regionId}" and
                inherits the region's visibility.
              </p>
            ) : (
              <div>
                <Label className="text-[10px]">Visibility</Label>
                <Select
                  value={selected.visibility ?? "dm"}
                  onValueChange={(v) => setVisibility(selected.id, v as EntityVisibility)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["player", "rumor", "dm", "hidden"].map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>
    </TabFrame>
  );
}
