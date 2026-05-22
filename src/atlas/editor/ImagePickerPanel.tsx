import { useRef, useState } from "react";

interface ImagePickerPanelProps {
  images: string[];
  onSelect: (name: string) => void;
  onImport: (file: File) => void;
  onDelete?: (name: string) => void;
  onClose: () => void;
}

export function ImagePickerPanel({ images, onSelect, onImport, onDelete, onClose }: ImagePickerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = "";
  };

  const visible = query
    ? images.filter((n) => n.toLowerCase().includes(query.toLowerCase()))
    : images;

  return (
    <div className="border rounded bg-background shadow-lg text-xs mb-1">
      <div className="flex items-center justify-between px-2 py-1 border-b">
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => fileInputRef.current?.click()}
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
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground px-1"
          aria-label="Close image picker"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      {images.length > 0 && (
        <div className="px-2 pt-1">
          <input
            type="search"
            placeholder="Search images…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded border px-2 py-0.5 text-xs bg-background"
          />
        </div>
      )}
      {images.length === 0 ? (
        <p className="px-2 py-3 text-muted-foreground italic text-center">
          No images yet — import one above
        </p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-3 text-muted-foreground italic text-center">
          No images match
        </p>
      ) : (
        <div className="flex flex-wrap gap-1 p-2 max-h-40 overflow-y-auto">
          {visible.map((name) => (
            <div key={name} className="relative group">
              <button
                type="button"
                title={name}
                className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-muted border border-transparent hover:border-border w-20 text-[10px] truncate"
                onClick={() => onSelect(name)}
              >
                <img
                  src={`/atlas/assets/images/${name}`}
                  alt={name}
                  className="w-16 h-12 object-cover rounded"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="w-full truncate text-center">{name}</span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  aria-label={`Delete ${name}`}
                  title={`Delete ${name}`}
                  className="absolute top-0.5 right-0.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] leading-none"
                  onClick={(e) => { e.stopPropagation(); onDelete(name); }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
