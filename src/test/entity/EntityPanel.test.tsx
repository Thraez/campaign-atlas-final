import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EntityPanel } from "@/atlas/entity/EntityPanel";
import type { AssetCredit, CreditsConfig, Entity, MapPlacement } from "@/atlas/content/schema";
import type { EntityRelationship } from "@/atlas/profiles/profileTypes";

const e: Entity = {
  id: "corven",
  title: "Corven",
  type: "npc",
  visibility: "player",
  aliases: [],
  tags: [],
  images: [],
  body: "",
  bodyHtml: "<p>Bio body</p>",
  frontmatter: {},
  sourcePath: "",
  links: [],
  backlinks: [],
} as Entity;

const ally: Entity = {
  id: "ally-npc",
  title: "Ally NPC",
  type: "npc",
  visibility: "player",
  aliases: [],
  tags: [],
  images: [],
  body: "",
  bodyHtml: "",
  frontmatter: {},
  sourcePath: "",
  links: [],
  backlinks: [],
} as Entity;

const baseEntityById = new Map([
  [e.id, e],
  [ally.id, ally],
]);

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
    expect(screen.queryByText(/my notes/i)).not.toBeInTheDocument();
  });
  it("shows them by default (player site unchanged)", () => {
    renderPanel(true);
    expect(screen.getByLabelText(/handout as PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/my notes/i)).toBeInTheDocument();
  });
});

describe("EntityPanel — Connections section", () => {
  it("shows no Connections section when relationships is absent", () => {
    renderPanel();
    expect(screen.queryByTestId("connections-section")).not.toBeInTheDocument();
  });

  it("shows no Connections section when relationships is empty", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("connections-section")).not.toBeInTheDocument();
  });

  it("renders Connections section with a player-visible relationship", () => {
    const rel: EntityRelationship = {
      entity: "ally-npc",
      type: "allied_with",
      visibility: "player",
    };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("connections-section")).toBeInTheDocument();
    expect(screen.getByText("Ally NPC")).toBeInTheDocument();
    expect(screen.queryByText("(DM)")).not.toBeInTheDocument();
  });

  it("shows (DM) badge on dm-visibility relationships", () => {
    const rel: EntityRelationship = {
      entity: "ally-npc",
      type: "secret_enemy",
      label: "Secret Foe",
      visibility: "dm",
    };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("(DM)")).toBeInTheDocument();
    expect(screen.getByText("Ally NPC")).toBeInTheDocument();
  });

  it("prefers label over type when both present", () => {
    const rel: EntityRelationship = {
      entity: "ally-npc",
      type: "allied_with",
      label: "Close Ally",
      visibility: "player",
    };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Close Ally:/)).toBeInTheDocument();
    expect(screen.queryByText(/allied_with/)).not.toBeInTheDocument();
  });

  it("degrades gracefully when target id is unresolved — shows raw id, no crash", () => {
    const rel: EntityRelationship = {
      entity: "unknown-ghost-id",
      type: "haunts",
      visibility: "player",
    };
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={new Map([[e.id, e]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("connections-section")).toBeInTheDocument();
    expect(screen.getByText("unknown-ghost-id")).toBeInTheDocument();
  });

  it("calls onOpenEntity with the target id when a Connections entry is clicked", () => {
    const rel: EntityRelationship = {
      entity: "ally-npc",
      type: "allied_with",
      visibility: "player",
    };
    const onOpenEntity = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, relationships: [rel] }}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={onOpenEntity}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    screen.getByText("Ally NPC").click();
    expect(onOpenEntity).toHaveBeenCalledWith("ally-npc");
  });
});

// ── L1 — Credit badge ────────────────────────────────────────────────────────

const entityWithImage: Entity = {
  ...e,
  images: ["thumb.png"],
  credit: "Art by Jane Doe",
} as Entity;

function renderWithBadge(opts: { credit?: string | undefined; credits?: CreditsConfig } = {}) {
  const entity = {
    ...entityWithImage,
    credit: "credit" in opts ? opts.credit : entityWithImage.credit,
  } as Entity;
  return render(
    <MemoryRouter>
      <EntityPanel
        entity={entity}
        placements={[]}
        entityById={new Map([[entity.id, entity]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        credits={opts.credits}
      />
    </MemoryRouter>,
  );
}

describe("EntityPanel — credit badge", () => {
  it("renders badge when entity has credit and badges are not disabled", () => {
    renderWithBadge();
    expect(
      screen.getByRole("note", { name: /Image credit: Art by Jane Doe/i }),
    ).toBeInTheDocument();
  });

  it("hides badge when credits.badges is false", () => {
    renderWithBadge({ credits: { badges: false } });
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("no badge when entity has no credit field", () => {
    renderWithBadge({ credit: undefined });
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("no badge when entity has no images (images.length === 0 guard)", () => {
    const entity = { ...entityWithImage, images: [] } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("renders a badge on each image when entity has multiple images", () => {
    const entity = { ...entityWithImage, images: ["img1.png", "img2.png"] } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    const badges = screen.getAllByRole("note", { name: /Image credit: Art by Jane Doe/i });
    expect(badges).toHaveLength(2);
  });
});

// ── Phase 3 — assetCredits registry gating ───────────────────────────────────

describe("EntityPanel — asset credit registry", () => {
  it("registry entry takes precedence over entity.credit when enabled", () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png"],
      credit: "Fallback credit",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          assetCredits={{ "thumb.png": { credit: "Registry credit", enabled: true } }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("note", { name: /Image credit: Registry credit/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fallback credit")).not.toBeInTheDocument();
  });

  it("hides the badge when the registry entry is disabled, even with text present (no fallback)", () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png"],
      credit: "Fallback credit",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          assetCredits={{ "thumb.png": { credit: "Registry credit", enabled: false } }}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("hides the badge when the registry entry is enabled but has empty credit text", () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png"],
      credit: "Fallback credit",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          assetCredits={{ "thumb.png": { credit: "", enabled: true } }}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });

  it("falls back to entity.credit for a src with no registry entry", () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png", "other.png"],
      credit: "Fallback credit",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          assetCredits={{ "thumb.png": { credit: "Registry credit", enabled: true } }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("note", { name: /Image credit: Registry credit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("note", { name: /Image credit: Fallback credit/i }),
    ).toBeInTheDocument();
  });

  it("master switch (credits.badges === false) suppresses an enabled registry credit too", () => {
    const entity = { ...entityWithImage, images: ["thumb.png"] } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          credits={{ badges: false }}
          assetCredits={{ "thumb.png": { credit: "Registry credit", enabled: true } }}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });
});

// ── Phase 3 — lightbox credit badge ───────────────────────────────────────────

describe("EntityPanel — lightbox credit badge", () => {
  it("shows the resolved entity.credit badge on the lightbox image when opened", async () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png"],
      credit: "Art by Jane Doe",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      // The thumbnail badge is still in the DOM but the modal marks the rest
      // of the page aria-hidden while open, so only the lightbox badge is
      // reachable by role here — that's correct modal a11y behavior.
      expect(
        screen.getByRole("note", { name: /Image credit: Art by Jane Doe/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows the registry credit (not the entity fallback) in the lightbox when a registry entry resolves", async () => {
    const entity = {
      ...entityWithImage,
      images: ["thumb.png"],
      credit: "Fallback credit",
    } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          assetCredits={{ "thumb.png": { credit: "Registry credit", enabled: true } }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(
        screen.getAllByRole("note", { name: /Image credit: Registry credit/i }).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("note", { name: /Image credit: Fallback credit/i }),
    ).not.toBeInTheDocument();
  });

  it("no badge in the lightbox when nothing resolves", async () => {
    const entity = { ...entityWithImage, images: ["thumb.png"], credit: undefined } as Entity;
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entity}
          placements={[]}
          entityById={new Map([[entity.id, entity]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.queryByRole("note", { name: /Image credit/i })).not.toBeInTheDocument();
  });
});

// ── N47 — hover-peek prop bindings ───────────────────────────────────────────

const entityWithBacklink: Entity = {
  ...e,
  backlinks: [{ id: "ally-npc", title: "Ally NPC" }],
} as Entity;

const entityWithRelationship: Entity = {
  ...e,
  relationships: [{ entity: "ally-npc", type: "allied_with", visibility: "player" as const }],
} as Entity;

describe("EntityPanel — hover-peek prop bindings (N47)", () => {
  it("calls onPeek with backlink id + rect on mouseEnter", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseEnter(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on mouseLeave from a backlink button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseLeave(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });

  it("calls onPeek with backlink id on focus", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.focus(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on blur from a backlink button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithBacklink}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.blur(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });

  it("calls onPeek with Connection entity id + rect on mouseEnter", () => {
    const onPeek = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithRelationship}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeek={onPeek}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseEnter(screen.getByText("Ally NPC"));
    expect(onPeek).toHaveBeenCalledWith("ally-npc", expect.any(Object));
  });

  it("calls onPeekLeave on mouseLeave from a Connections entry button", () => {
    const onPeekLeave = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithRelationship}
          placements={[]}
          entityById={baseEntityById}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
          onPeekLeave={onPeekLeave}
        />
      </MemoryRouter>,
    );
    fireEvent.mouseLeave(screen.getByText("Ally NPC"));
    expect(onPeekLeave).toHaveBeenCalledTimes(1);
  });
});

// ── N76 — structural / interaction branches ──────────────────────────────────

describe("EntityPanel — null entity empty state (N76)", () => {
  it("renders the 'select a pin' prompt when entity is null", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={null}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/select a pin/i)).toBeInTheDocument();
  });
});

describe("EntityPanel — header fields (N76)", () => {
  it("renders entity.summary as a quoted paragraph", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, summary: "A shadowy figure." }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("A shadowy figure.")).toBeInTheDocument();
  });

  it("renders entity.aliases as 'aka ...'", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, aliases: ["The Shadow", "Shade"] }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/aka The Shadow, Shade/)).toBeInTheDocument();
  });

  it("renders the 'Rumored' badge when entity.visibility is 'rumor'", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, visibility: "rumor" as const }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/rumored/i)).toBeInTheDocument();
  });

  it("includes entity.race in the type kicker when both type and race are set", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, race: "Human" } as Entity}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    // playerTypeLabel("npc") === "Person"
    expect(screen.getByText("Person · Human")).toBeInTheDocument();
  });

  it("renders entity.tags as # links", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, tags: ["kingdom", "rival"] }}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("#kingdom")).toBeInTheDocument();
    expect(screen.getByText("#rival")).toBeInTheDocument();
  });
});

describe("EntityPanel — placement and onShowOnMap (N76)", () => {
  const p: MapPlacement = {
    id: "pin1",
    entityId: "corven",
    mapId: "world-map",
    x: 50,
    y: 75,
    visibility: "player",
  };

  it("renders 'Show on map' button when placements is non-empty", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[p]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/show on map/i)).toBeInTheDocument();
  });

  it("calls onShowOnMap with the placement object when 'Show on map' is clicked", () => {
    const onShowOnMap = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[p]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={onShowOnMap}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText(/show on map/i));
    expect(onShowOnMap).toHaveBeenCalledWith(p);
  });
});

describe("EntityPanel — onClose callback (N76)", () => {
  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={onClose}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText(/close panel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── N77 — ImageThumb broken-image + CopyLinkButton copied state ──────────────

const entityWithPortrait: Entity = {
  ...e,
  images: ["portrait.png"],
} as Entity;

describe("EntityPanel — ImageThumb broken-image placeholder (N77)", () => {
  it("renders the image thumbnail initially with no placeholder", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithPortrait}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("img", { name: /Corven image 1/i })).toBeInTheDocument();
    expect(screen.queryByText("Image missing")).not.toBeInTheDocument();
  });

  it("fires onError → 'Image missing' placeholder shown, original img gone", () => {
    render(
      <MemoryRouter>
        <EntityPanel
          entity={entityWithPortrait}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.error(screen.getByRole("img", { name: /Corven image 1/i }));
    const placeholder = screen.getByText("Image missing");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveAttribute("title", expect.stringContaining("Image failed to load:"));
    expect(screen.queryByRole("img", { name: /Corven image 1/i })).not.toBeInTheDocument();
  });
});

describe("EntityPanel — CopyLinkButton copied state (N77)", () => {
  it("shows the Check icon (text-green-500) after a successful clipboard write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    render(
      <MemoryRouter>
        <EntityPanel
          entity={e}
          placements={[]}
          entityById={new Map()}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTitle("Copy share link"));
    await waitFor(() => {
      expect(screen.getByTitle("Copy share link").querySelector(".text-green-500")).toBeTruthy();
    });
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });
});

// ── Q9 — Player profile block ────────────────────────────────────────────────

describe("EntityPanel — player profile block (Q9)", () => {
  function renderWithProfile(overrides: Partial<Entity>) {
    return render(
      <MemoryRouter>
        <EntityPanel
          entity={{ ...e, ...overrides }}
          placements={[]}
          entityById={new Map([[e.id, e]])}
          onOpenEntity={() => {}}
          onClose={() => {}}
          onShowOnMap={() => {}}
        />
      </MemoryRouter>,
    );
  }

  it("renders nothing when profile is absent", () => {
    renderWithProfile({});
    expect(screen.queryByTestId("player-profile-block")).not.toBeInTheDocument();
  });

  it("renders nothing when profile.player is absent", () => {
    renderWithProfile({ profile: {} });
    expect(screen.queryByTestId("player-profile-block")).not.toBeInTheDocument();
  });

  it("renders nothing when profile.player is empty (all fields absent)", () => {
    renderWithProfile({ profile: { player: {} } });
    expect(screen.queryByTestId("player-profile-block")).not.toBeInTheDocument();
  });

  it("renders known_for when present", () => {
    renderWithProfile({ profile: { player: { known_for: "A master smuggler" } } });
    expect(screen.getByTestId("player-profile-block")).toBeInTheDocument();
    expect(screen.getByText("A master smuggler")).toBeInTheDocument();
    expect(screen.getByText(/known for/i)).toBeInTheDocument();
  });

  it("renders visible_traits as a bulleted list", () => {
    renderWithProfile({
      profile: { player: { visible_traits: ["Wears a red cloak", "Speaks with an accent"] } },
    });
    expect(screen.getByText("Wears a red cloak")).toBeInTheDocument();
    expect(screen.getByText("Speaks with an accent")).toBeInTheDocument();
    expect(screen.getByText(/visible traits/i)).toBeInTheDocument();
  });

  it("renders rumors as a list", () => {
    renderWithProfile({
      profile: { player: { rumors: ["Said to have fought a dragon", "Rumored to be nobility"] } },
    });
    expect(screen.getByText("Said to have fought a dragon")).toBeInTheDocument();
    expect(screen.getByText("Rumored to be nobility")).toBeInTheDocument();
    expect(screen.getByText(/rumors/i)).toBeInTheDocument();
  });

  it("renders all three fields together", () => {
    renderWithProfile({
      profile: {
        player: {
          known_for: "Quick wit",
          visible_traits: ["Scarred cheek"],
          rumors: ["May be a spy"],
        },
      },
    });
    expect(screen.getByText("Quick wit")).toBeInTheDocument();
    expect(screen.getByText("Scarred cheek")).toBeInTheDocument();
    expect(screen.getByText("May be a spy")).toBeInTheDocument();
  });

  it("does not render profile.dm content in the output", () => {
    renderWithProfile({
      profile: {
        player: { known_for: "Quick wit" },
        dm: { secret_motive: "DM_SECRET_MOTIVE" },
      },
    });
    expect(screen.queryByText("DM_SECRET_MOTIVE")).not.toBeInTheDocument();
    expect(screen.queryByText(/secret_motive/i)).not.toBeInTheDocument();
  });
});

// ── Q10 — Lightbox prev/next + keyboard nav + counter ───────────────────────

const entityWith3Images: Entity = {
  ...e,
  images: ["img1.png", "img2.png", "img3.png"],
  credit: "Art by Jane",
} as Entity;

const entityWith1Image: Entity = {
  ...e,
  images: ["solo.png"],
} as Entity;

function renderLightboxPanel(entity: Entity, assetCredits?: Record<string, AssetCredit>) {
  return render(
    <MemoryRouter>
      <EntityPanel
        entity={entity}
        placements={[]}
        entityById={new Map([[entity.id, entity]])}
        onOpenEntity={() => {}}
        onClose={() => {}}
        onShowOnMap={() => {}}
        assetCredits={assetCredits}
      />
    </MemoryRouter>,
  );
}

describe("EntityPanel — lightbox navigation (Q10)", () => {
  it("opens the lightbox when a thumbnail is clicked", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("shows prev/next buttons when entity has multiple images", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Previous image")).toBeInTheDocument();
      expect(screen.getByLabelText("Next image")).toBeInTheDocument();
    });
  });

  it("hides prev/next buttons when entity has a single image", async () => {
    renderLightboxPanel(entityWith1Image);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
  });

  it("shows the n/total counter in the lightbox for multi-image entities", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
  });

  it("advances to the next image when the Next button is clicked", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
    fireEvent.click(screen.getByLabelText("Next image"));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");
    });
  });

  it("goes to the previous image when the Prev button is clicked", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 2/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");
    });
    fireEvent.click(screen.getByLabelText("Previous image"));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
  });

  it("wraps from last image to first on Next", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 3/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("3 / 3");
    });
    fireEvent.click(screen.getByLabelText("Next image"));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
  });

  it("advances on ArrowRight keydown", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");
    });
  });

  it("goes back on ArrowLeft keydown", async () => {
    renderLightboxPanel(entityWith3Images);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 2/i }));
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("2 / 3");
    });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(screen.getByTestId("lightbox-counter")).toHaveTextContent("1 / 3");
    });
  });

  it("credit badge tracks the current image when navigating", async () => {
    const entity: Entity = {
      ...e,
      images: ["img1.png", "img2.png"],
    } as Entity;
    const assetCredits: Record<string, AssetCredit> = {
      "img1.png": { credit: "Credit for img1", enabled: true },
      "img2.png": { credit: "Credit for img2", enabled: true },
    };
    renderLightboxPanel(entity, assetCredits);
    fireEvent.click(screen.getByRole("img", { name: /Corven image 1/i }));
    await waitFor(() => {
      // Modal aria-hides the rest of the page; only the lightbox badge is accessible
      expect(
        screen.getAllByRole("note", { name: /Image credit: Credit for img1/i }).length,
      ).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByLabelText("Next image"));
    await waitFor(() => {
      expect(
        screen.getAllByRole("note", { name: /Image credit: Credit for img2/i }).length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole("note", { name: /Image credit: Credit for img1/i }),
    ).not.toBeInTheDocument();
  });
});
