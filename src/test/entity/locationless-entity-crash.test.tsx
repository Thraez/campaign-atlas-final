/**
 * Regression: opening a location-less entity (e.g. an Event with no map
 * placement) must not crash and must show the entity's title and lore.
 *
 * Full AtlasViewer + Leaflet cannot be mounted under jsdom. We test the
 * smallest subtree that controls the crash path: EntityPanel rendered with
 * an entity that has zero placements, mirroring exactly what AtlasViewer
 * passes when a location-less entity is opened.
 *
 * This is the isolated-component equivalent documented in the D1 spec
 * (docs/superpowers/specs/2026-05-30-crash-guard-error-boundary-design.md §Part C).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { Entity } from "@/atlas/content/schema";

const eventEntity: Entity = {
  id: "the-sundering",
  title: "The Sundering",
  type: "event",
  visibility: "player",
  aliases: [],
  tags: ["history"],
  images: [],
  body: "A cataclysmic event that shattered the world.",
  bodyHtml: "<p>A cataclysmic event that shattered the world.</p>",
  frontmatter: {},
  sourcePath: "events/the-sundering.md",
  links: [],
  backlinks: [],
} as Entity;

describe("location-less entity — no crash regression", () => {
  it("renders an Event with no placements without throwing", () => {
    expect(() =>
      render(
        <MemoryRouter>
          <EntityPanel
            entity={eventEntity}
            placements={[]}
            entityById={new Map([[eventEntity.id, eventEntity]])}
            onOpenEntity={() => {}}
            onClose={() => {}}
            onShowOnMap={() => {}}
          />
        </MemoryRouter>
      )
    ).not.toThrow();
  });

  it("shows the entity title and lore body for a location-less Event", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={eventEntity}
          placements={[]}
          entityById={new Map([[eventEntity.id, eventEntity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("The Sundering")).toBeInTheDocument();
    expect(screen.getByText("A cataclysmic event that shattered the world.")).toBeInTheDocument();
  });

  it("does not render any 'Show on map' button when the entity has no placements", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={eventEntity}
          placements={[]}
          entityById={new Map([[eventEntity.id, eventEntity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText(/show on map/i)).not.toBeInTheDocument();
  });
});
