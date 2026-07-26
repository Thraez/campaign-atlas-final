import { useState } from "react";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportImage } from "../mapImport";

export function SelectStep({
  images,
  onPick,
  onDrop,
  onRemove,
}: {
  images: ImportImage[];
  onPick: () => void;
  onDrop: (files: FileList) => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="space-y-3 p-1">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) onDrop(e.dataTransfer.files);
        }}
        onClick={onPick}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm font-medium">Drop map images here or click to browse</div>
        <div className="text-[11px] text-muted-foreground mt-1">
          PNG, JPG, WEBP, SVG · multiple files OK
        </div>
      </div>
      {images.map((img) => (
        <div
          key={img.id}
          className="flex items-center gap-3 rounded-md border border-border p-2 bg-card/50"
        >
          <img
            src={img.dataUrl}
            alt={img.originalFilename}
            className="h-12 w-12 object-cover rounded bg-muted"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{img.originalFilename}</div>
            <div className="text-[10px] text-muted-foreground">
              {img.naturalWidth}×{img.naturalHeight} · {(img.bytes / 1024).toFixed(0)} KB
              {img.bytes > 4 * 1024 * 1024 && <span className="text-amber-500 ml-1">large</span>}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onRemove(img.id)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {images.length === 0 && (
        <div className="text-xs text-muted-foreground italic text-center py-2 flex items-center gap-2 justify-center">
          <ImageIcon className="h-3.5 w-3.5" /> No images added yet.
        </div>
      )}
    </div>
  );
}
