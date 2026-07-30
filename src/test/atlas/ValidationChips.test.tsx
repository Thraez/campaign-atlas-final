import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValidationChips, type ValidationChipIssue } from "@/atlas/tabs/ValidationChips";

function makeIssues(count: number): ValidationChipIssue[] {
  return Array.from({ length: count }, (_, i) => ({
    severity: i % 2 === 0 ? "blocking" : "warning",
    message: `Issue ${i + 1}`,
  }));
}

describe("ValidationChips", () => {
  it("shows an overflow row when issues exceed the limit", () => {
    render(<ValidationChips issues={makeIssues(8)} limit={5} />);
    expect(screen.getAllByText(/^Issue \d+$/)).toHaveLength(5);
    expect(screen.getByText("+3 more")).toBeTruthy();
  });

  it("shows no overflow row at or below the limit", () => {
    render(<ValidationChips issues={makeIssues(5)} limit={5} />);
    expect(screen.getAllByText(/^Issue \d+$/)).toHaveLength(5);
    expect(screen.queryByText(/more$/)).toBeNull();

    render(<ValidationChips issues={makeIssues(3)} limit={5} />);
    expect(screen.queryByText(/more$/)).toBeNull();
  });
});
