import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaveStatusChip, dirtyFileSummary, relativeTime } from "@/atlas/SaveStatusChip";

describe("SaveStatusChip", () => {
  it("renders Saved + relative time when status=saved", () => {
    render(<SaveStatusChip status="saved" savedAt={new Date(Date.now() - 12_000).toISOString()} />);
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("12s ago")).toBeTruthy();
  });

  it("renders Unsaved with file-impact sub-line", () => {
    render(<SaveStatusChip status="unsaved" dirtySummary="world.yaml + 2 entities" />);
    expect(screen.getByText("Unsaved")).toBeTruthy();
    expect(screen.getByText("world.yaml + 2 entities")).toBeTruthy();
  });

  it("renders Saving… (no click) and is not a button", () => {
    render(<SaveStatusChip status="saving" />);
    expect(screen.getByText("Saving…")).toBeTruthy();
    // Saving chip is non-interactive.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders Save failed with optional message and is clickable", () => {
    const onForceSave = vi.fn();
    render(
      <SaveStatusChip
        status="failed"
        failedMessage="409 stale-base on world.yaml"
        onForceSave={onForceSave}
      />,
    );
    expect(screen.getByText("Save failed")).toBeTruthy();
    expect(screen.getByText(/stale-base/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    expect(onForceSave).toHaveBeenCalledTimes(1);
  });

  it("Unsaved chip is clickable to force-save", () => {
    const onForceSave = vi.fn();
    render(
      <SaveStatusChip status="unsaved" dirtySummary="world.yaml" onForceSave={onForceSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(onForceSave).toHaveBeenCalledTimes(1);
  });
});

describe("dirtyFileSummary", () => {
  it("returns 'no changes' when nothing is dirty", () => {
    expect(dirtyFileSummary({ entityCount: 0, worldYamlDirty: false })).toBe("no changes");
  });

  it("returns just the entity count when world.yaml is clean", () => {
    expect(dirtyFileSummary({ entityCount: 1, worldYamlDirty: false })).toBe("1 entity");
    expect(dirtyFileSummary({ entityCount: 3, worldYamlDirty: false })).toBe("3 entities");
  });

  it("returns just 'world.yaml' when no entities are dirty", () => {
    expect(dirtyFileSummary({ entityCount: 0, worldYamlDirty: true })).toBe("world.yaml");
  });

  it("combines world.yaml and entity count when both are dirty", () => {
    expect(dirtyFileSummary({ entityCount: 2, worldYamlDirty: true })).toBe(
      "world.yaml + 2 entities",
    );
  });
});

describe("relativeTime", () => {
  const NOW = 1_700_000_000_000;
  it("just now under 5 seconds", () => {
    expect(relativeTime(new Date(NOW - 2000).toISOString(), NOW)).toBe("just now");
  });
  it("seconds under a minute", () => {
    expect(relativeTime(new Date(NOW - 42_000).toISOString(), NOW)).toBe("42s ago");
  });
  it("minutes under an hour", () => {
    expect(relativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m ago");
  });
  it("hours under a day", () => {
    expect(relativeTime(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h ago");
  });
});
