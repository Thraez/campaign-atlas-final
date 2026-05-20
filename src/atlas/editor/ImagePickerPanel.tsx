import { useRef } from "react";

interface ImagePickerPanelProps {
  images: string[];
  onSelect: (name: string) => void;
  onImport: (file: File) => void;
  onClose: () => void;
}

export function ImagePickerPanel({ images, onSelect, onImport, onClose }: ImagePickerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = "";
  };

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
      {images.length === 0 ? (
        <p className="px-2 py-3 text-muted-foreground italic text-center">
          No images yet — import one above
        </p>
      ) : (
        <div className="flex flex-wrap gap-1 p-2 max-h-40 overflow-y-auto">
          {images.map((name) => (
            <button
              key={name}
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
          ))}
        </div>
      )}
    </div>
  );
}
