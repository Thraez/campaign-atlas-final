// src/test/pins/PinStateBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinStateBadge } from "@/atlas/pins/PinStateBadge";

describe("PinStateBadge", () => {
  it("says Placed when placed", () => {
    render(<PinStateBadge placed />);
    expect(screen.getByText(/placed/i)).toBeInTheDocument();
    expect(screen.queryByText(/not on map/i)).toBeNull();
  });
  it("says Not on map when unplaced (explicit, not absence)", () => {
    render(<PinStateBadge placed={false} />);
    expect(screen.getByText(/not on map/i)).toBeInTheDocument();
  });
});
