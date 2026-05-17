import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import { EntityPanes } from "@/atlas/entity/EntityPanes";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven", title: "Corven", type: "npc", visibility: "dm",
  aliases: [], tags: [], images: [], body: "Public line.\n\n%%\nSECRET-XYZ\n%%\n",
  bodyHtml: "", frontmatter: {}, sourcePath: "p/c.md", links: [], backlinks: [],
} as Entity;

const renderPanes = (mode: "reading" | "editing") =>
  render(
    <MemoryRouter>
      <ViewModeProvider>
        <EntityPanes
          entity={corven}
          entitiesById={new Map([[corven.id, corven]])}
          mode={mode}
          renderEdit={() => <textarea data-testid="edit" defaultValue={corven.body} />}
        />
      </ViewModeProvider>
    </MemoryRouter>,
  );

describe("EntityPanes", () => {
  it("reading mode: DM pane visible by default (secret shown), Player pane appears after expand", () => {
    renderPanes("reading");
    expect(screen.getByText(/SECRET-XYZ/)).toBeInTheDocument();
    expect(screen.queryByTestId("entity-pane-player")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    const player = screen.getByTestId("entity-pane-player");
    expect(player).toBeInTheDocument();
    expect(player.textContent ?? "").not.toContain("SECRET-XYZ");
  });

  it("editing mode: Edit pane visible by default; DM then Player expand in order", () => {
    renderPanes("editing");
    expect(screen.getByTestId("edit")).toBeInTheDocument();
    expect(screen.queryByTestId("entity-pane-dm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add dm view|expand dm/i }));
    expect(screen.getByTestId("entity-pane-dm")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    expect(screen.getByTestId("entity-pane-player")).toBeInTheDocument();
  });
});
