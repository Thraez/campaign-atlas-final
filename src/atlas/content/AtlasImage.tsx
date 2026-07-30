import { useEffect, useState, type CSSProperties } from "react";

const DEFAULT_FALLBACK_CLASS =
  "flex items-center justify-center rounded border border-dashed border-border bg-muted/30 text-[10px] text-muted-foreground text-center px-1.5 leading-tight";

export interface AtlasImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  onClick?: () => void;
}

/**
 * Plain presentational `<img>` that swaps to a visible "Image missing" box on
 * load failure instead of a browser broken-image glyph or a silently hidden
 * element. No editor imports — safe for both player and editor call sites.
 */
export function AtlasImage({
  src,
  alt,
  className,
  fallbackClassName,
  style,
  loading,
  onClick,
}: AtlasImageProps) {
  const [broken, setBroken] = useState(false);

  // A single AtlasImage instance can be reused across a changing src (e.g. a
  // lightbox stepping through images) — reset the failed state so a new src
  // gets its own load attempt instead of being stuck on the old fallback.
  useEffect(() => setBroken(false), [src]);

  if (broken) {
    return (
      <div
        className={fallbackClassName ?? DEFAULT_FALLBACK_CLASS}
        style={style}
        title={`Image failed to load: ${src}`}
        onClick={onClick}
      >
        Image missing
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onClick={onClick}
      onError={() => setBroken(true)}
    />
  );
}
