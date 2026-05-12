import { useAtlas } from "@/atlas/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Trash2, ArrowUp, ArrowDown, Lock, LockOpen, Search, Upload, Link as LinkIcon, BookmarkPlus, Crosshair, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function flyTo(x: number, y: number, zoom?: number) {
  window.dispatchEvent(new CustomEvent("atlas-flyto", { detail: { x, y, zoom } }));
}
function flyToBounds(x: number, y: number, w: number, h: number) {
  window.dispatchEvent(new CustomEvent("atlas-flyto", { detail: { bounds: { x, y, w, h } } }));
}

function pointsBounds(points: [number, number][]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

export function SidePanel() {
  const atlas = useAtlas((s) => s.atlas);
  const updateWorld = useAtlas((s) => s.updateWorld);
  const selectedId = useAtlas((s) => s.selectedId);
  const select = useAtlas((s) => s.select);
  const updatePin = useAtlas((s) => s.updatePin);
  const deletePin = useAtlas((s) => s.deletePin);
  const addLayer = useAtlas((s) => s.addLayer);
  const updateLayer = useAtlas((s) => s.updateLayer);
  const deleteLayer = useAtlas((s) => s.deleteLayer);
  const updateRegion = useAtlas((s) => s.updateRegion);
  const deleteRegion = useAtlas((s) => s.deleteRegion);
  const updateRoute = useAtlas((s) => s.updateRoute);
  const deleteRoute = useAtlas((s) => s.deleteRoute);
  const updateRelation = useAtlas((s) => s.updateRelation);
  const deleteRelation = useAtlas((s) => s.deleteRelation);
  const addViewBookmark = useAtlas((s) => s.addViewBookmark);
  const updateViewBookmark = useAtlas((s) => s.updateViewBookmark);
  const deleteViewBookmark = useAtlas((s) => s.deleteViewBookmark);
  const [query, setQuery] = useState("");
  const [currentView, setCurrentView] = useState<{ centerX: number; centerY: number; zoom: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onViewport = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail.centerX === "number") setCurrentView(detail);
    };
    window.addEventListener("atlas-viewport", onViewport);
    return () => window.removeEventListener("atlas-viewport", onViewport);
  }, []);

  const addLayerFromSrc = async (src: string, name: string) => {
    try {
      const { w, h } = await loadImageSize(src);
      const maxSide = Math.min(atlas.world.width, atlas.world.height) * 0.4;
      const scale = Math.min(maxSide / w, maxSide / h);
      const width = w * scale;
      const height = h * scale;
      addLayer({
        id: `layer-${Date.now()}`, type: "imageLayer", name, src,
        x: atlas.world.width / 2 - width / 2,
        y: atlas.world.height / 2 - height / 2,
        width, height, opacity: 1,
        zIndex: atlas.layers.length, visibility: "public",
      });
      toast.success(`Added "${name}" (${w}×${h})`);
    } catch (e: any) {
      toast.error(e.message || "Could not load image");
    }
  };

  const onFilePicked = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => addLayerFromSrc(String(reader.result), file.name.replace(/\.[^.]+$/, ""));
    reader.readAsDataURL(file);
  };

  const selectedPin = atlas.pins.find((p) => p.id === selectedId);
  const selectedLayer = atlas.layers.find((l) => l.id === selectedId);
  const selectedRelation = atlas.relations.find((r) => r.id === selectedId);
  const selectedRegion = atlas.regions.find((r) => r.id === selectedId);
  const selectedRoute = atlas.routes.find((r) => r.id === selectedId);
  const relationFrom = selectedRelation ? atlas.pins.find((p) => p.id === selectedRelation.from) : undefined;
  const relationTo = selectedRelation ? atlas.pins.find((p) => p.id === selectedRelation.to) : undefined;

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return atlas.pins.filter((p) => p.name.toLowerCase().includes(q) || p.type.includes(q)).slice(0, 20);
  }, [query, atlas.pins]);

  const reorderLayer = (id: string, dir: -1 | 1) => {
    const sorted = [...atlas.layers].sort((a, b) => a.zIndex - b.zIndex);
    const i = sorted.findIndex((l) => l.id === id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    updateLayer(a.id, { zIndex: b.zIndex });
    updateLayer(b.id, { zIndex: a.zIndex });
  };

  const captureBookmark = () => {
    if (!currentView) return toast.error("Move the map once, then capture a view");
    const name = prompt("View name:", `View ${(atlas.viewBookmarks ?? []).length + 1}`)?.trim();
    if (!name) return;
    addViewBookmark({ id: `view-${Date.now()}`, name, x: currentView.centerX, y: currentView.centerY, zoom: currentView.zoom });
    toast.success("View saved");
  };

  return (
    <aside className="atlas-side-panel w-80 flex flex-col">
      <Tabs defaultValue="selected" className="flex-1 flex flex-col">
        <TabsList className="m-2 grid grid-cols-4">
          <TabsTrigger value="selected">Selected</TabsTrigger>
          <TabsTrigger value="layers">Layers</TabsTrigger>
          <TabsTrigger value="views">Views</TabsTrigger>
          <TabsTrigger value="world">World</TabsTrigger>
        </TabsList>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-7 h-8" placeholder="Search pins…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1 max-h-40 overflow-auto rounded border border-border bg-background">
              {searchResults.map((p) => (
                <button key={p.id} className="block w-full text-left px-2 py-1 text-xs hover:bg-accent/30"
                  title="Double-click to fly to"
                  onClick={() => { select(p.id); setQuery(""); }}
                  onDoubleClick={() => { select(p.id); setQuery(""); flyTo(p.x, p.y); }}>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-muted-foreground">{p.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 px-3 pb-3">
          <TabsContent value="selected" className="space-y-3 mt-0">
            {!selectedPin && !selectedLayer && !selectedRelation && !selectedRegion && !selectedRoute && <p className="text-sm text-muted-foreground">Click a pin, map layer, region, route, or relation to inspect or edit it.</p>}
            {selectedRegion && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Region</p>
                <Input value={selectedRegion.name} onChange={(e) => updateRegion(selectedRegion.id, { name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Fill</Label><Input type="color" value={selectedRegion.fillColor} onChange={(e) => updateRegion(selectedRegion.id, { fillColor: e.target.value })} className="h-9 p-1" /></div>
                  <div className="space-y-1"><Label>Border</Label><Input type="color" value={selectedRegion.borderColor} onChange={(e) => updateRegion(selectedRegion.id, { borderColor: e.target.value })} className="h-9 p-1" /></div>
                </div>
                <div className="space-y-1"><Label>Opacity {selectedRegion.opacity.toFixed(2)}</Label><Slider value={[selectedRegion.opacity]} min={0} max={0.8} step={0.05} onValueChange={(v) => updateRegion(selectedRegion.id, { opacity: v[0] })} /></div>
                <div className="space-y-1"><Label>Visibility</Label><select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={selectedRegion.visibility} onChange={(e) => updateRegion(selectedRegion.id, { visibility: e.target.value as any })}>{["public","discovered","rumored","hidden","dm","false_info"].map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-16" placeholder="Description" value={selectedRegion.description || ""} onChange={(e) => updateRegion(selectedRegion.id, { description: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { if (selectedRegion.points) { const b = pointsBounds(selectedRegion.points); flyToBounds(b.x, b.y, b.w, b.h); } }}><LocateFixed className="h-4 w-4 mr-1" /> Locate</Button>
                  <Button variant="destructive" size="sm" onClick={() => { deleteRegion(selectedRegion.id); select(null); }}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                </div>
              </div>
            )}
            {selectedRoute && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Route</p>
                <Input value={selectedRoute.name} onChange={(e) => updateRoute(selectedRoute.id, { name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Style</Label><select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={selectedRoute.style || "solid"} onChange={(e) => updateRoute(selectedRoute.id, { style: e.target.value as any })}>{["solid","dashed","dotted"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div className="space-y-1"><Label>Color</Label><Input type="color" value={selectedRoute.color || "#f4c95d"} onChange={(e) => updateRoute(selectedRoute.id, { color: e.target.value })} className="h-9 p-1" /></div>
                </div>
                <div className="space-y-1"><Label>Visibility</Label><select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={selectedRoute.visibility} onChange={(e) => updateRoute(selectedRoute.id, { visibility: e.target.value as any })}>{["public","discovered","rumored","hidden","dm","false_info"].map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-16" placeholder="Description" value={selectedRoute.description || ""} onChange={(e) => updateRoute(selectedRoute.id, { description: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { const b = pointsBounds(selectedRoute.points); flyToBounds(b.x, b.y, b.w, b.h); }}><LocateFixed className="h-4 w-4 mr-1" /> Locate</Button>
                  <Button variant="destructive" size="sm" onClick={() => { deleteRoute(selectedRoute.id); select(null); }}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                </div>
              </div>
            )}
            {selectedRelation && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Relation</p>
                <div className="text-xs text-muted-foreground">
                  {relationFrom?.name ?? "?"} ↔ {relationTo?.name ?? "?"}
                </div>
                <div className="space-y-1">
                  <Label>Label</Label>
                  <Input value={selectedRelation.label || ""} onChange={(e) => updateRelation(selectedRelation.id, { label: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={selectedRelation.type}
                    onChange={(e) => updateRelation(selectedRelation.id, { type: e.target.value })}>
                    {["road","trade_route","river_connection","shipping_lane","alliance","rivalry","war_front","smuggling_route","migration_path","divine_influence","ley_line","planar_connection","prophecy_link","historical_event","faction_control","supply_line","custom"]
                      .map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Style</Label>
                    <select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                      value={selectedRelation.lineStyle || "solid"}
                      onChange={(e) => updateRelation(selectedRelation.id, { lineStyle: e.target.value as any })}>
                      {["solid","dashed","dotted"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Color</Label>
                    <Input type="color" value={selectedRelation.color || "#7fd1ff"}
                      onChange={(e) => updateRelation(selectedRelation.id, { color: e.target.value })} className="h-9 p-1" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Visibility</Label>
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={selectedRelation.visibility}
                    onChange={(e) => updateRelation(selectedRelation.id, { visibility: e.target.value as any })}>
                    {["public","discovered","rumored","hidden","dm","false_info"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-16"
                    value={selectedRelation.description || ""}
                    onChange={(e) => updateRelation(selectedRelation.id, { description: e.target.value })} />
                </div>
                <Button variant="destructive" size="sm" onClick={() => { deleteRelation(selectedRelation.id); select(null); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete relation
                </Button>
              </div>
            )}
            {selectedLayer && !selectedPin && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Map layer</p>
                <Input value={selectedLayer.name} onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })} />
                <p className="text-xs text-muted-foreground">Drag the ✥ handle on the map to move, ⤡ to resize. Use the Layers tab for more options.</p>
              </div>
            )}
            {selectedPin && (
              <>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={selectedPin.name} onChange={(e) => updatePin(selectedPin.id, { name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={selectedPin.type}
                    onChange={(e) => updatePin(selectedPin.id, { type: e.target.value as any })}>
                    {["city","town","village","capital","fortress","ruin","dungeon","cave","temple","npc","shop","wilderness_landmark","portal","mystery","custom"]
                      .map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Icon</Label>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-md border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
                      {selectedPin.icon
                        ? <img src={selectedPin.icon} alt="" className="h-full w-full object-cover" />
                        : <span className="text-lg">{({ city:"🏙",town:"🏘",village:"🏡",capital:"👑",fortress:"🏰",ruin:"🏚",dungeon:"⚔",cave:"🕳",temple:"🛕",npc:"🧙",shop:"🛒",wilderness_landmark:"⛰",portal:"🌀",mystery:"❓",custom:"📍" } as any)[selectedPin.type] || "📍"}</span>}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-1">
                      <Button size="sm" variant="secondary" onClick={() => {
                        const inp = document.createElement("input");
                        inp.type = "file"; inp.accept = "image/*";
                        inp.onchange = () => {
                          const f = inp.files?.[0]; if (!f) return;
                          const r = new FileReader();
                          r.onload = () => updatePin(selectedPin.id, { icon: String(r.result) });
                          r.readAsDataURL(f);
                        };
                        inp.click();
                      }}>Upload</Button>
                      <Button size="sm" variant="secondary" onClick={() => {
                        const url = prompt("Icon image URL:", selectedPin.icon || "");
                        if (url !== null) updatePin(selectedPin.id, { icon: url || undefined });
                      }}>From URL</Button>
                    </div>
                    {selectedPin.icon && (
                      <Button size="icon" variant="ghost" title="Reset to default" onClick={() => updatePin(selectedPin.id, { icon: undefined })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Visibility</Label>
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={selectedPin.visibility}
                    onChange={(e) => updatePin(selectedPin.id, { visibility: e.target.value as any })}>
                    {["public","discovered","rumored","hidden","dm","false_info"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>X</Label>
                    <Input type="number" value={Math.round(selectedPin.x)} onChange={(e) => updatePin(selectedPin.id, { x: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1"><Label>Y</Label>
                    <Input type="number" value={Math.round(selectedPin.y)} onChange={(e) => updatePin(selectedPin.id, { y: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Player description</Label>
                  <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-16"
                    value={selectedPin.playerDescription || ""}
                    onChange={(e) => updatePin(selectedPin.id, { playerDescription: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>DM description</Label>
                  <textarea className="w-full rounded-md border border-input bg-background p-2 text-sm min-h-16"
                    value={selectedPin.dmDescription || ""}
                    onChange={(e) => updatePin(selectedPin.id, { dmDescription: e.target.value })} />
                </div>
                <Button variant="destructive" size="sm" onClick={() => deletePin(selectedPin.id)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete pin
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="layers" className="space-y-3 mt-0">
            <div className="flex gap-1">
              <input ref={fileRef} type="file" accept="image/*" hidden multiple
                onChange={(e) => { Array.from(e.target.files || []).forEach(onFilePicked); e.currentTarget.value = ""; }} />
              <Button size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Upload image
              </Button>
              <Button size="sm" variant="secondary" title="Add from URL" onClick={() => {
                const src = prompt("Image URL for new map layer:");
                if (!src) return;
                const name = prompt("Layer name:", "New Map") || "New Map";
                addLayerFromSrc(src, name);
              }}><LinkIcon className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Upload preserves the image's original aspect ratio.</p>
            {atlas.layers.length === 0 && <p className="text-xs text-muted-foreground">No map layers yet.</p>}
            {[...atlas.layers].sort((a, b) => b.zIndex - a.zIndex).map((l) => (
              <div key={l.id}
                className={`rounded border p-2 space-y-2 cursor-pointer ${selectedId === l.id ? "border-primary bg-primary/10" : "border-border bg-background/50"}`}
                onClick={() => select(l.id)}
                onDoubleClick={() => { select(l.id); flyToBounds(l.x, l.y, l.width, l.height); }}
                title="Double-click to fly to">
                <div className="flex items-center justify-between gap-1">
                  <Input value={l.name} onClick={(e) => e.stopPropagation()} onChange={(e) => updateLayer(l.id, { name: e.target.value })} className="h-8" />
                  <Button size="icon" variant="ghost" title="Move up" onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, 1); }}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Move down" onClick={(e) => { e.stopPropagation(); reorderLayer(l.id, -1); }}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title={l.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { locked: !l.locked }); }}>
                    {l.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteLayer(l.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                  <label>X<Input type="number" value={Math.round(l.x)} onChange={(e) => updateLayer(l.id, { x: +e.target.value })} className="h-7" /></label>
                  <label>Y<Input type="number" value={Math.round(l.y)} onChange={(e) => updateLayer(l.id, { y: +e.target.value })} className="h-7" /></label>
                  <label>W<Input type="number" value={Math.round(l.width)} onChange={(e) => updateLayer(l.id, { width: +e.target.value })} className="h-7" /></label>
                  <label>H<Input type="number" value={Math.round(l.height)} onChange={(e) => updateLayer(l.id, { height: +e.target.value })} className="h-7" /></label>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Label className="text-xs">Opacity {l.opacity.toFixed(2)}</Label>
                  <Slider value={[l.opacity]} min={0} max={1} step={0.05}
                    onValueChange={(v) => updateLayer(l.id, { opacity: v[0] })} />
                </div>
                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  <Label className="text-xs">Visibility</Label>
                  <select className="rounded-md border border-input bg-background px-1.5 py-0.5 text-xs"
                    value={l.visibility}
                    onChange={(e) => updateLayer(l.id, { visibility: e.target.value as any })}>
                    {["public","discovered","rumored","hidden","dm"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="views" className="space-y-3 mt-0">
            <Button size="sm" className="w-full" onClick={captureBookmark}>
              <BookmarkPlus className="h-4 w-4 mr-1" /> Capture current view
            </Button>
            {(atlas.viewBookmarks ?? []).length === 0 && <p className="text-xs text-muted-foreground">No saved views yet.</p>}
            {(atlas.viewBookmarks ?? []).map((bookmark) => (
              <div key={bookmark.id} className="atlas-list-card space-y-2">
                <div className="flex items-center gap-1">
                  <Input value={bookmark.name} className="h-8" onChange={(e) => updateViewBookmark(bookmark.id, { name: e.target.value })} />
                  <Button size="icon" variant="ghost" title="Go to view" onClick={() => flyTo(bookmark.x, bookmark.y, bookmark.zoom)}>
                    <Crosshair className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Delete view" onClick={() => deleteViewBookmark(bookmark.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(bookmark.x)}, {Math.round(bookmark.y)} · zoom {bookmark.zoom.toFixed(2)}
                </p>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="world" className="space-y-3 mt-0">
            <div className="space-y-1"><Label>World name</Label>
              <Input value={atlas.world.name} onChange={(e) => updateWorld({ name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Width</Label>
                <Input type="number" value={atlas.world.width} onChange={(e) => updateWorld({ width: +e.target.value })} />
              </div>
              <div className="space-y-1"><Label>Height</Label>
                <Input type="number" value={atlas.world.height} onChange={(e) => updateWorld({ height: +e.target.value })} />
              </div>
            </div>
            <div className="space-y-1"><Label>Ocean color</Label>
              <Input type="color" value={atlas.world.oceanColor} onChange={(e) => updateWorld({ oceanColor: e.target.value })} className="h-10 w-full p-1" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Wrap horizontally</Label>
              <Switch checked={atlas.world.wrapX} onCheckedChange={(c) => updateWorld({ wrapX: c })} />
            </div>
            <div className="space-y-1"><Label>km per world unit</Label>
              <Input type="number" step="0.01" value={atlas.world.kmPerWorldUnit}
                onChange={(e) => updateWorld({ kmPerWorldUnit: +e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Min zoom</Label>
                <Input type="number" value={atlas.world.minZoom} onChange={(e) => updateWorld({ minZoom: +e.target.value })} />
              </div>
              <div className="space-y-1"><Label>Max zoom</Label>
                <Input type="number" value={atlas.world.maxZoom} onChange={(e) => updateWorld({ maxZoom: +e.target.value })} />
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Fog of War</p>
              <div className="flex items-center justify-between">
                <Label>Enable in player view</Label>
                <Switch checked={atlas.fog.mode === "player"} onCheckedChange={(c) => useAtlas.getState().setFog({ mode: c ? "player" : "off" })} />
              </div>
              <p className="text-xs text-muted-foreground">Use the ☁ Reveal tool to drop visibility circles where the party has been.</p>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => useAtlas.getState().clearFog()}>Clear all reveals</Button>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Travel speed (normal)</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={atlas.travelSpeeds.normal}
                  onChange={(e) => useAtlas.getState().setTravelSpeeds({ normal: +e.target.value })} />
                <select className="rounded-md border border-input bg-background px-2 text-sm"
                  value={atlas.travelSpeeds.unit}
                  onChange={(e) => useAtlas.getState().setTravelSpeeds({ unit: e.target.value as any })}>
                  <option value="miles_per_day">miles/day</option>
                  <option value="km_per_day">km/day</option>
                </select>
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}
