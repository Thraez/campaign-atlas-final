import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ViewModeProvider } from "@/atlas/view/ViewModeProvider";
import { EntityPanes } from "@/atlas/entity/EntityPanes";
import type { Entity } from "@/atlas/content/schema";

const corven = {
  id: "corven", title: "Corven", type: "npc", visibility: "dm",
  aliases: [], tags: [], images: [], body: "Public line.\n\n%%\nSECRET-XYZ\n%%\n",
  bodyHtml: "", frontmatter: {}, sourcePath: "p/c.md", links: [], backlinks: [],
} as Entity;

const withHeadings = {
  ...corven,
  body: "# Intro\n\nPublic intro.\n\n# History\n\nMore public.\n%%\nSECRET\n%%\n",
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
  it("reading mode: DM pane visible by default (secret shown), Player pane hidden then visible after expand", () => {
    renderPanes("reading");
    expect(screen.getByText(/SECRET-XYZ/)).toBeInTheDocument();
    // Player pane is always mounted (persistent-DOM) but hidden initially.
    const playerBefore = screen.getByTestId("entity-pane-player");
    expect(playerBefore).toBeInTheDocument();
    expect(playerBefore).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    const player = screen.getByTestId("entity-pane-player");
    expect(player).toBeVisible();
    expect(player.textContent ?? "").not.toContain("SECRET-XYZ");
  });

  it("editing mode: Edit pane visible by default; DM then Player expand in order", () => {
    renderPanes("editing");
    expect(screen.getByTestId("edit")).toBeInTheDocument();
    // DM pane is always mounted (persistent-DOM); hidden via display:none when collapsed.
    expect(screen.getByTestId("entity-pane-dm")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /add dm view|expand dm/i }));
    expect(screen.getByTestId("entity-pane-dm")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    expect(screen.getByTestId("entity-pane-player")).toBeVisible();
  });

  it("player pane headings get data-anchor-id after mount (enables scroll-sync)", async () => {
    render(
      <MemoryRouter>
        <ViewModeProvider>
          <EntityPanes
            entity={withHeadings}
            entitiesById={new Map([[withHeadings.id, withHeadings]])}
            mode="reading"
            renderEdit={() => null}
          />
        </ViewModeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add player view/i }));
    const playerPane = screen.getByTestId("entity-pane-player");
    await waitFor(() => {
      expect(playerPane.querySelectorAll("[data-anchor-id]").length).toBeGreaterThan(0);
    });
  });

  it("floor: a pane keeps its own scrollTop across collapse/expand of another pane", () => {
    renderPanes("reading");
    fireEvent.click(screen.getByRole("button", { name: /add player view|expand player/i }));
    const dm = screen.getByTestId("entity-pane-dm");
    Object.defineProperty(dm, "scrollHeight", { value: 1000, configurable: true });
    dm.scrollTop = 240;
    // Collapse the player pane — DM must NOT reset to 0 (no unmount).
    fireEvent.click(screen.getByRole("button", { name: /－ player view|remove player/i }));
    expect(dm.scrollTop).toBe(240);
  });
});
