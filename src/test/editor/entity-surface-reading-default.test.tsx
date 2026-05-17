import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntitySurface } from "@/atlas/entity/EntitySurface";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
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
        <ViewModeProvider>
          <EntitySurface
            entity={corven}
            entitiesById={new Map([[corven.id, corven]])}
            renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
            onClose={() => {}}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Corven").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reading|done|back/i }));
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });

  it("the panel X closes the surface (regression: X was a dead no-op)", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntitySurface
            entity={corven}
            entitiesById={new Map([[corven.id, corven]])}
            renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
            onClose={onClose}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    // Reading mode: the only close affordance is the panel's top-right X.
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close panel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surface hosts the pane pipeline: Edit toggles the Edit pane, panes persist", () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntitySurface
            entity={corven}
            entitiesById={new Map([[corven.id, corven]])}
            renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
            onClose={() => {}}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    // Reading default: DM pane present, no edit form.
    expect(screen.getByTestId("entity-pane-dm")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
  });
});
