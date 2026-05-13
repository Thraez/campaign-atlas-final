/**
 * Convert an atlas frontmatter `date` string to a sortable integer using a
 * world calendar. Supports:
 *   - "YYYY-MM-DD"  (preferred for in-world dates)
 *   - "YYYY-MM"     (sorted to day 1 of that month)
 *   - "YYYY"        (sorted to day 1 of month 1)
 *   - any ISO 8601 date string parsable by Date.parse()
 *
 * Returns { value, year, label } or null when unparseable.
 */
import type { WorldCalendar } from "../../src/atlas/content/schema";

export interface ParsedDate {
  value: number;        // sortable integer (days from epoch year 0)
  year: number;
  monthIndex?: number;  // 0-based
  day?: number;
  label: string;        // pretty rendered label
}

const ISO_RE = /^(-?\d{1,6})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/;

export function parseAtlasDate(
  raw: string | undefined,
  calendar: WorldCalendar | undefined
): ParsedDate | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = ISO_RE.exec(trimmed);
  if (m) {
    const year = parseInt(m[1], 10);
    const monthIndex = m[2] ? Math.max(1, Math.min(parseInt(m[2], 10), 99)) - 1 : 0;
    const day = m[3] ? Math.max(1, parseInt(m[3], 10)) : 1;
    if (calendar) {
      const months = calendar.months;
      const safeMonth = Math.min(monthIndex, months.length - 1);
      const yearLength = months.reduce((a, b) => a + b.days, 0);
      const dayOfYear =
        months.slice(0, safeMonth).reduce((a, b) => a + b.days, 0) +
        Math.min(day, months[safeMonth].days);
      const value = year * yearLength + dayOfYear;
      const monthName = months[safeMonth]?.name ?? `M${safeMonth + 1}`;
      const epoch = calendar.epochName ? ` ${calendar.epochName}` : "";
      const label = m[2] || m[3]
        ? `${day} ${monthName}, ${year}${epoch}`
        : `${year}${epoch}`;
      return { value, year, monthIndex: safeMonth, day, label };
    }
    // No calendar: use 365-day approximation for sorting.
    const value = year * 365 + monthIndex * 30 + day;
    return { value, year, monthIndex, day, label: trimmed };
  }
  // Fallback: attempt JS Date parse (for real-world ISO timestamps).
  const ts = Date.parse(trimmed);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return { value: Math.floor(ts / 86400000), year: d.getUTCFullYear(), label: trimmed };
  }
  return null;
}
