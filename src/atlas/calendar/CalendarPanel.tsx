/**
 * Name the months of the world's year.
 *
 * Until this is filled in, `parseAtlasDate` has no month names to work with and
 * every dated entry renders as "612 · month 6, day 3" — readable, but not the
 * world's own voice. Configuring it used to mean hand-editing `calendar:` in
 * world.yaml, which no screen in the app ever mentioned.
 *
 * The panel writes into the same world.yaml save batch as the map / region /
 * route / fog tabs, so it is a local draft until the DM hits Save.
 */
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { WorldCalendar, CalendarMonth } from "@/atlas/content/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_MONTH_DAYS = 30;

export function CalendarPanel({
  calendar,
  onPatch,
}: {
  calendar: WorldCalendar | undefined;
  /** Emit the next calendar, or undefined to drop `calendar:` from world.yaml. */
  onPatch: (next: WorldCalendar | undefined) => void;
}) {
  const months = calendar?.months ?? [];

  const yearLength = useMemo(
    () => months.reduce((sum, m) => sum + (Number.isFinite(m.days) ? m.days : 0), 0),
    [months],
  );

  /** Emit a calendar, collapsing to undefined once nothing is left to store. */
  const emit = (next: Partial<WorldCalendar>) => {
    const merged: WorldCalendar = {
      name: calendar?.name,
      epochName: calendar?.epochName,
      daysPerWeek: calendar?.daysPerWeek,
      months,
      ...next,
    };
    const hasContent =
      merged.months.length > 0 || !!merged.name?.trim() || !!merged.epochName?.trim();
    onPatch(hasContent ? merged : undefined);
  };

  const setMonth = (index: number, patch: Partial<CalendarMonth>) =>
    emit({ months: months.map((m, i) => (i === index ? { ...m, ...patch } : m)) });

  const addMonth = () => emit({ months: [...months, { name: "", days: DEFAULT_MONTH_DAYS }] });

  const removeMonth = (index: number) =>
    emit({ months: months.filter((_, i) => i !== index) });

  const blankNames = months.filter((m) => !m.name.trim()).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        <p className="text-xs text-muted-foreground">
          Name the months of your year and dates will read the way your world does — “3 Longnight,
          612 AS” instead of “612 · month 6, day 3”.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="cal-epoch" className="text-xs">
            What you count years from
          </Label>
          <Input
            id="cal-epoch"
            className="h-8 text-xs"
            placeholder="AS"
            value={calendar?.epochName ?? ""}
            onChange={(e) => emit({ epochName: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Shown after the year, so “612” becomes “612 {calendar?.epochName?.trim() || "AS"}”.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cal-name" className="text-xs">
            Calendar name <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="cal-name"
            className="h-8 text-xs"
            placeholder="The Deep Reckoning"
            value={calendar?.name ?? ""}
            onChange={(e) => emit({ name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-xs">Months</Label>
            {months.length > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {months.length} {months.length === 1 ? "month" : "months"} · {yearLength}-day year
              </span>
            )}
          </div>

          {months.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No months yet. Dates will keep showing as plain numbers until you add some.
            </p>
          ) : (
            <ol className="space-y-1.5 list-none pl-0">
              {months.map((m, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-4 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <Input
                    className="h-8 text-xs flex-1 min-w-0"
                    placeholder="Month name"
                    aria-label={`Name of month ${i + 1}`}
                    value={m.name}
                    onChange={(e) => setMonth(i, { name: e.target.value })}
                  />
                  <Input
                    className="h-8 w-16 text-xs tabular-nums"
                    type="number"
                    min={1}
                    aria-label={`Days in month ${i + 1}`}
                    value={m.days}
                    onChange={(e) =>
                      setMonth(i, { days: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">days</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    aria-label={`Remove month ${i + 1}`}
                    onClick={() => removeMonth(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          )}

          {blankNames > 0 && (
            <p className="text-[11px] text-amber-500">
              {blankNames === 1 ? "One month has" : `${blankNames} months have`} no name yet — those
              dates will show a number instead.
            </p>
          )}

          <Button variant="outline" size="sm" className="h-8 w-full gap-1 text-xs" onClick={addMonth}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add a month
          </Button>
        </div>
      </div>
    </div>
  );
}
