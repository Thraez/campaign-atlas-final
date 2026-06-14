import { describe, it, expect } from "vitest";
import { parseAtlasDate } from "../../scripts/atlas/calendarDate";
import type { WorldCalendar } from "@/atlas/content/schema";

// A minimal 3-month world calendar: Frostmelt (30d), Highsun (40d), Ashfall (35d) = 105d/year
const THREE_MONTH_CAL: WorldCalendar = {
  months: [
    { name: "Frostmelt", days: 30 },
    { name: "Highsun",   days: 40 },
    { name: "Ashfall",   days: 35 },
  ],
};

const THREE_MONTH_WITH_EPOCH: WorldCalendar = {
  ...THREE_MONTH_CAL,
  epochName: "AS",
};

describe("parseAtlasDate", () => {
  it("returns null for null / undefined / empty input", () => {
    expect(parseAtlasDate(undefined, undefined)).toBeNull();
    expect(parseAtlasDate("", undefined)).toBeNull();
    expect(parseAtlasDate("   ", undefined)).toBeNull();
  });

  it("returns null for a completely unparseable string", () => {
    expect(parseAtlasDate("not-a-date", undefined)).toBeNull();
    expect(parseAtlasDate("Year of the Flood", undefined)).toBeNull();
  });

  it("YYYY-MM-DD without calendar: uses 365-day approximation, label = raw string", () => {
    const result = parseAtlasDate("1247-03-15", undefined);
    expect(result).not.toBeNull();
    // value = 1247 * 365 + 2 * 30 + 15 = 455155 + 60 + 15 = 455230
    expect(result!.value).toBe(1247 * 365 + 2 * 30 + 15);
    expect(result!.year).toBe(1247);
    expect(result!.monthIndex).toBe(2);
    expect(result!.day).toBe(15);
    expect(result!.label).toBe("1247-03-15");
  });

  it("YYYY only without calendar: defaults month=0 day=1", () => {
    const result = parseAtlasDate("800", undefined);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(800 * 365 + 0 * 30 + 1);
    expect(result!.year).toBe(800);
    expect(result!.label).toBe("800");
  });

  it("YYYY-MM only without calendar: defaults day=1", () => {
    const result = parseAtlasDate("1300-07", undefined);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1300 * 365 + 6 * 30 + 1);
    expect(result!.year).toBe(1300);
    expect(result!.monthIndex).toBe(6);
    expect(result!.day).toBe(1);
  });

  it("YYYY-MM-DD with calendar: uses calendar month lengths for value and month name in label", () => {
    // 1247-02-10 = month index 1 (Highsun), day 10
    // dayOfYear = months[0].days + 10 = 30 + 10 = 40
    // value = 1247 * 105 + 40 = 130935 + 40 = 130975
    const result = parseAtlasDate("1247-02-10", THREE_MONTH_CAL);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1247 * 105 + 40);
    expect(result!.year).toBe(1247);
    expect(result!.label).toBe("10 Highsun, 1247");
  });

  it("calendar label includes epoch name when set", () => {
    const result = parseAtlasDate("500-01-01", THREE_MONTH_WITH_EPOCH);
    expect(result).not.toBeNull();
    expect(result!.label).toContain("AS");
    expect(result!.label).toBe("1 Frostmelt, 500 AS");
  });

  it("YYYY only with calendar: label is just year (no month/day parts)", () => {
    const result = parseAtlasDate("1000", THREE_MONTH_CAL);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("1000");
  });

  it("calendar month index overflow is capped to last month", () => {
    // month 99 (index 98) should clamp to months.length - 1 = 2 (Ashfall)
    const result = parseAtlasDate("100-99-01", THREE_MONTH_CAL);
    expect(result).not.toBeNull();
    expect(result!.monthIndex).toBe(2); // clamped
  });

  it("ISO 8601 timestamp falls through to Date.parse", () => {
    // A real-world ISO timestamp: not matched by ISO_RE (has time component)
    const result = parseAtlasDate("2023-06-15T12:00:00Z", undefined);
    expect(result).not.toBeNull();
    expect(result!.year).toBe(2023);
    expect(result!.label).toBe("2023-06-15T12:00:00Z");
  });
});
