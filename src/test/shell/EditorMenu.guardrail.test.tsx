// src/test/shell/EditorMenu.guardrail.test.tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorMenu, EDITOR_MENU_ITEMS } from "@/atlas/shell/EditorMenu";

describe("EditorMenu guardrail", () => {
  it("contains only the allow-listed items", () => {
    expect(EDITOR_MENU_ITEMS.map((i) => i.id).sort()).toEqual([
      "calendar",
      "help",
      "manage-assets",
      "map-details",
      "world-details",
    ]);
  });

  it("contains no export/clone/backup/offline action ever", () => {
    const banned = /export|clone|backup|offline|composite|download|zip|patch/i;
    for (const item of EDITOR_MENU_ITEMS) {
      expect(item.id).not.toMatch(banned);
      expect(item.label).not.toMatch(banned);
    }
  });

  it("renders the allow-listed labels", () => {
    render(
      <EditorMenu
        onWorldDetails={vi.fn()}
        onMapDetails={vi.fn()}
        onCalendar={vi.fn()}
        onAssetManager={vi.fn()}
        onHelp={vi.fn()}
        open
      />,
    );
    expect(screen.getByText("Edit world details")).toBeInTheDocument();
    expect(screen.getByText("Edit map details")).toBeInTheDocument();
    expect(screen.getByText("Name the months")).toBeInTheDocument();
    expect(screen.getByText("Manage assets")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
  });
});

describe("toolbar stacking guard", () => {
  it("keeps .atlas-toolbar above the Leaflet z-index and free of backdrop-filter", () => {
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const block = (sel: string) => {
      const m = css.match(new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]*)\\}`));
      expect(m, sel).not.toBeNull();
      return m![1];
    };
    // A z-index is a number or a stacking token (P-01's `var(--z-chrome)`),
    // resolved to its number from the same file.
    const zIndexOf = (decls: string) => {
      const raw = /z-index:\s*([^;]+);/.exec(decls)?.[1].trim();
      const token = raw && /^var\((--z-[\w-]+)\)$/.exec(raw)?.[1];
      const value = token ? new RegExp(`${token}:\\s*(\\d+);`).exec(css)?.[1] : raw;
      return Number(value);
    };
    const toolbar = block("\\.atlas-toolbar");
    const z = zIndexOf(toolbar);
    expect(toolbar).toMatch(/position:\s*relative/);
    expect(z).toBeGreaterThan(2);
    expect(toolbar).not.toMatch(/backdrop-filter/);
    const open = zIndexOf(block('\\.atlas-toolbar\\[data-menu-open="true"\\]'));
    expect(open).toBeGreaterThan(500);
  });
});
