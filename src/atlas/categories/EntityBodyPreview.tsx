import { useMemo } from "react";
import { renderEntityMarkdown } from "@/atlas/content/renderEntityMarkdown";

export function EntityBodyPreview({
  body, showDmNotes,
}: { body: string; showDmNotes: boolean }) {
  const html = useMemo(
    () => renderEntityMarkdown(body, { showDmNotes }),
    [body, showDmNotes],
  );
  return (
    <div
      className="prose prose-invert max-w-none text-xs p-3 overflow-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
