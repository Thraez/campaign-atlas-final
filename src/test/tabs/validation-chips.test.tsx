/**
 * Tests for src/atlas/tabs/ValidationChips.tsx
 *
 * Executable spec for the shared blocking/warning chip list used by the
 * Regions, Routes, and Fog tabs. Locks the behavior the three inlined copies
 * shared before extraction:
 *   - nothing renders for an empty issue list
 *   - blocking vs warning get their distinct color classes
 *   - the list caps at `limit` (default 5)
 *   - with onSelect each message is a clickable button (Regions/Routes)
 *   - without onSelect each message is plain text (Fog)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValidationChips, type ValidationChipIssue } from "@/atlas/tabs/ValidationChips";

interface RouteLikeIssue extends ValidationChipIssue {
  routeId?: string;
}

function issue(message: string, severity: "blocking" | "warning" = "warning"): ValidationChipIssue {
  return { severity, message };
}

describe("ValidationChips", () => {
  it("renders nothing when there are no issues", () => {
    const { container } = render(<ValidationChips issues={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one chip per issue", () => {
    render(<ValidationChips issues={[issue("a"), issue("b"), issue("c")]} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
  });

  it("caps the list at the default limit of 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => issue(`issue-${i}`));
    render(<ValidationChips issues={many} />);
    expect(screen.getByText("issue-0")).toBeInTheDocument();
    expect(screen.getByText("issue-4")).toBeInTheDocument();
    expect(screen.queryByText("issue-5")).not.toBeInTheDocument();
    expect(screen.queryByText("issue-7")).not.toBeInTheDocument();
  });

  it("honors an explicit limit", () => {
    const many = Array.from({ length: 8 }, (_, i) => issue(`issue-${i}`));
    render(<ValidationChips issues={many} limit={2} />);
    expect(screen.getByText("issue-0")).toBeInTheDocument();
    expect(screen.getByText("issue-1")).toBeInTheDocument();
    expect(screen.queryByText("issue-2")).not.toBeInTheDocument();
  });

  it("gives blocking and warning issues distinct color classes", () => {
    render(<ValidationChips issues={[issue("boom", "blocking"), issue("careful", "warning")]} />);
    const blockingChip = screen.getByText("boom").closest("div");
    const warningChip = screen.getByText("careful").closest("div");
    expect(blockingChip?.className).toContain("text-destructive");
    expect(warningChip?.className).toContain("text-amber-600");
  });

  it("renders messages as plain text when onSelect is omitted (Fog)", () => {
    render(<ValidationChips issues={[issue("no button here")]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("no button here")).toBeInTheDocument();
  });

  it("renders messages as buttons and invokes onSelect with the issue (Regions/Routes)", () => {
    const onSelect = vi.fn();
    const issues: RouteLikeIssue[] = [
      { severity: "blocking", message: "bad route", routeId: "route-1" },
    ];
    render(<ValidationChips issues={issues} onSelect={onSelect} />);
    const button = screen.getByRole("button", { name: "bad route" });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(issues[0]);
  });
});
