import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WanderControl } from "@/atlas/wander/WanderControl";

it("shows the meter and fires onWander when places remain", () => {
  const onWander = vi.fn();
  render(<WanderControl discovered={12} total={40} canWander onWander={onWander} />);
  expect(screen.getByText(/12 of 40 places/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /wander/i }));
  expect(onWander).toHaveBeenCalledTimes(1);
});

it("shows an all-found state when everything is discovered", () => {
  render(<WanderControl discovered={40} total={40} canWander={false} onWander={vi.fn()} />);
  expect(screen.getByText(/all 40 places found/i)).toBeTruthy();
});

it("renders nothing when there are no places", () => {
  const { container } = render(<WanderControl discovered={0} total={0} canWander={false} onWander={() => {}} />);
  expect(container.firstChild).toBeNull();
});
