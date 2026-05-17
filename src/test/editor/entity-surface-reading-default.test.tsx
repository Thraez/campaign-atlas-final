import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntitySurface } from "@/atlas/entity/EntitySurface";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven", title: "Corven", type: "npc", visibility: "dm",
  aliases: [], tags: [], images: [], body: "# Corven\n\nbody\n", bodyHtml: "",
  frontmatter: {}, sourcePath: "content/w/npcs/corven.md", links: [], backlinks: [],
} as Entity;

describe("entity surface opens in Reading, Edit toggles", () => {
  it("shows Reading (projected bio) first, with an Edit affordance", () => {
    render(
      <MemoryRouter>
        <EntitySurface
          entity={corven}
          entitiesById={new Map([[corven.id, corven]])}
          renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
          onClose={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Corven").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reading|done|back/i }));
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });
});
