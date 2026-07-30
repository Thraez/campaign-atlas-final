import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntitySurface } from "@/atlas/entity/EntitySurface";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven",
  title: "Corven",
  type: "npc",
  visibility: "dm",
  aliases: [],
  tags: [],
  images: [],
  body: "# Corven\n\nbody\n",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "content/w/npcs/corven.md",
  links: [],
  backlinks: [],
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

  it("startInEdit mounts the edit pane immediately (re-filing a misfiled note)", () => {
    // Regression: "File as Character" pre-applies a type to the edit draft, but
    // Reading mode never mounts the edit pane — so the click silently did
    // nothing and the session stayed clean.
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntitySurface
            entity={corven}
            entitiesById={new Map([[corven.id, corven]])}
            renderEdit={() => <div data-testid="edit-form">EDIT FORM</div>}
            onClose={() => {}}
            startInEdit
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("edit-form")).toBeInTheDocument();
    // Still a two-way toggle — re-filing doesn't trap the DM in Edit.
    fireEvent.click(screen.getByRole("button", { name: /reading|done|back/i }));
    expect(screen.queryByTestId("edit-form")).not.toBeInTheDocument();
  });

  it("defaults to Reading when startInEdit is omitted", () => {
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
