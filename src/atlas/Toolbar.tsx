import { useAtlas } from "@/atlas/store";
import { Button } from "@/components/ui/button";
import { MousePointer2, MapPin, Ruler, Eye, EyeOff, Download, Upload, Save, LogOut, Hexagon, Route as RouteIcon, CloudFog, Link2 } from "lucide-react";
import { toast } from "sonner";
import { defaultAtlas } from "@/atlas/types";
import { useRef } from "react";

interface Props {
  onSaveCloud?: () => void;
  onSignOut?: () => void;
  signedIn?: boolean;
}

export function Toolbar({ onSaveCloud, onSignOut, signedIn }: Props) {
  const tool = useAtlas((s) => s.tool);
  const setTool = useAtlas((s) => s.setTool);
  const view = useAtlas((s) => s.view);
  const setView = useAtlas((s) => s.setView);
  const atlas = useAtlas((s) => s.atlas);
  const setAtlas = useAtlas((s) => s.setAtlas);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(atlas, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${atlas.world.id || "atlas"}.json`;
    a.click();
    toast.success("Exported atlas JSON");
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed.world || !parsed.pins) throw new Error("Missing required fields");
        setAtlas({ ...defaultAtlas(), ...parsed });
        toast.success("Atlas imported");
      } catch (e: any) {
        toast.error("Invalid atlas JSON: " + e.message);
      }
    };
    reader.readAsText(file);
  };

  const ToolBtn = ({ id, icon: Icon, label }: any) => (
    <Button
      size="sm"
      variant={tool === id ? "default" : "secondary"}
      onClick={() => setTool(id)}
      title={label}
      className="atlas-tool-button gap-1"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );

  return (
    <div className="atlas-toolbar flex items-center gap-3 px-4 py-3">
      <h1 className="font-display text-lg text-primary mr-2 hidden sm:block">Living Atlas</h1>
      <div className="flex gap-1.5 flex-wrap">
        <ToolBtn id="select" icon={MousePointer2} label="Select" />
        <ToolBtn id="addPin" icon={MapPin} label="Pin" />
        <ToolBtn id="drawRegion" icon={Hexagon} label="Region" />
        <ToolBtn id="drawRoute" icon={RouteIcon} label="Route" />
        <ToolBtn id="addRelation" icon={Link2} label="Relation" />
        <ToolBtn id="revealFog" icon={CloudFog} label="Reveal" />
        <ToolBtn id="measure" icon={Ruler} label="Measure" />
      </div>
      <div className="flex-1" />
      <Button size="sm" variant="ghost" className="atlas-tool-button" onClick={() => setView(view === "dm" ? "player" : "dm")} title="Toggle view">
        {view === "dm" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        <span className="ml-1 text-xs uppercase tracking-wider">{view}</span>
      </Button>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      <Button size="sm" variant="secondary" className="atlas-icon-button" onClick={() => fileRef.current?.click()} title="Import JSON">
        <Upload className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="secondary" className="atlas-icon-button" onClick={exportJson} title="Export JSON">
        <Download className="h-4 w-4" />
      </Button>
      {signedIn && (
        <>
          <Button size="sm" variant="default" className="atlas-icon-button" onClick={onSaveCloud} title="Save to Cloud">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="atlas-icon-button" onClick={onSignOut} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
