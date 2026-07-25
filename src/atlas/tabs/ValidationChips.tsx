/**
 * Validation chips — the compact blocking/warning issue list shown under the
 * drawing toolbar in the Regions, Routes, and Fog tabs.
 *
 * All three tabs previously inlined an identical chip (same colors, same
 * five-item cap). Keeping three copies in sync was a standing drift risk — a
 * color tweak in one tab would silently diverge from the others. This is the
 * single source for that chip.
 *
 * `onSelect`, when provided, makes each message a button that focuses the
 * offending item (Regions/Routes select by id). Fog reveals are anonymous, so
 * FogTab omits it and the message renders as plain text.
 */

export interface ValidationChipIssue {
  severity: "blocking" | "warning";
  message: string;
}

interface ValidationChipsProps<T extends ValidationChipIssue> {
  issues: T[];
  /** Max chips to render (default 5). */
  limit?: number;
  /** When set, each chip's message becomes a button invoking this with the issue. */
  onSelect?: (issue: T) => void;
}

export function ValidationChips<T extends ValidationChipIssue>({
  issues,
  limit = 5,
  onSelect,
}: ValidationChipsProps<T>) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-1">
      {issues.slice(0, limit).map((issue, idx) => (
        <div
          key={idx}
          className={`text-[11px] px-2 py-1 rounded border ${
            issue.severity === "blocking"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {onSelect ? (
            <button className="text-left hover:underline" onClick={() => onSelect(issue)}>
              {issue.message}
            </button>
          ) : (
            issue.message
          )}
        </div>
      ))}
      {issues.length > limit ? (
        <div className="text-[11px] text-muted-foreground px-2">
          +{issues.length - limit} more
        </div>
      ) : null}
    </div>
  );
}
