import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HoverPeekCard } from "@/atlas/peek/HoverPeekCard";
import type { Entity } from "@/atlas/content/schema";

const base: Entity = {
  id: "saltmere", title: "Saltmere", type: "settlement", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "", frontmatter: {},
  sourcePath: "", links: [], backlinks: [],
} as unknown as Entity;

it("renders a dialog with title + type badge", () => {
  render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={() => {}} />);
  expect(screen.getByRole("dialog", { name: /saltmere preview/i })).toBeTruthy();
  expect(screen.getByText("settlement")).toBeTruthy();
});

it("omits the portrait when there is no image", () => {
  render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={() => {}} />);
  expect(screen.queryByRole("img")).toBeNull();
});

it("shows the map button only when a placement exists and fires onFlyToMap", () => {
  const onFly = vi.fn();
  const { rerender } = render(<HoverPeekCard entity={base} hasPlacement={false} onOpen={() => {}} onFlyToMap={onFly} />);
  expect(screen.queryByRole("button", { name: /show saltmere on the map/i })).toBeNull();
  rerender(<HoverPeekCard entity={{ ...base, images: ["portrait.png"], summary: "A salt harbor." }} hasPlacement onOpen={() => {}} onFlyToMap={onFly} />);
  expect(screen.getByRole("img")).toBeTruthy();
  expect(screen.getByText("A salt harbor.")).toBeTruthy();
  screen.getByRole("button", { name: /show saltmere on the map/i }).click();
  expect(onFly).toHaveBeenCalled();
});
