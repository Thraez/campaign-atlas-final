import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { Entity } from "@/atlas/content/schema";

const e: Entity = {
  id: "corven", title: "Corven", type: "npc", visibility: "player",
  aliases: [], tags: [], images: [], body: "", bodyHtml: "<p>Bio body</p>",
  frontmatter: {}, sourcePath: "", links: [], backlinks: [],
} as Entity;

const renderPanel = (readerAffordances?: boolean) =>
  render(
    <MemoryRouter>
      <EntityPanel
        entity={e}
        placements={[]}
        entityById={new Map([[e.id, e]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        readerAffordances={readerAffordances}
      />
    </MemoryRouter>,
  );

describe("EntityPanel (shared)", () => {
  it("renders the entity bio", () => {
    renderPanel();
    expect(screen.getByText("Corven")).toBeInTheDocument();
    expect(screen.getByText("Bio body")).toBeInTheDocument();
  });
  it("hides player-personal notes + handout when readerAffordances=false", () => {
    renderPanel(false);
    expect(screen.queryByLabelText(/handout as PDF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Notes$/i)).not.toBeInTheDocument();
  });
  it("shows them by default (player site unchanged)", () => {
    renderPanel(true);
    expect(screen.getByLabelText(/handout as PDF/i)).toBeInTheDocument();
  });
});
