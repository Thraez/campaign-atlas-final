import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { Entity } from "@/atlas/content/schema";

const e: Entity = {
  id: "corven", title: "Corven", type: "npc", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "",
  frontmatter: {}, sourcePath: "", links: [],
  backlinks: [{ id: "saltmere", title: "Saltmere" }],
} as Entity;

it("fires onPeek with the backlink id on mouseenter", () => {
  const onPeek = vi.fn();
  render(
    <MemoryRouter>
      <EntityPanel
        entity={e}
        placements={[]}
        entityById={new Map([[e.id, e]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        onPeek={onPeek}
        onPeekLeave={() => {}}
      />
    </MemoryRouter>,
  );
  const btn = screen.getByText("Saltmere");
  fireEvent.mouseEnter(btn);
  expect(onPeek).toHaveBeenCalledWith("saltmere", expect.any(Object));
});
