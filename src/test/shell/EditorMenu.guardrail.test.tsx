// src/test/shell/EditorMenu.guardrail.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorMenu, EDITOR_MENU_ITEMS } from "@/atlas/shell/EditorMenu";

describe("EditorMenu guardrail", () => {
  it("contains only the allow-listed items", () => {
    expect(EDITOR_MENU_ITEMS.map((i) => i.id).sort()).toEqual(
      ["help", "map-details", "world-details"],
    );
  });

  it("contains no export/clone/backup/offline action ever", () => {
    const banned = /export|clone|backup|offline|composite|download|zip|patch/i;
    for (const item of EDITOR_MENU_ITEMS) {
      expect(item.id).not.toMatch(banned);
      expect(item.label).not.toMatch(banned);
    }
  });

  it("renders the allow-listed labels", () => {
    render(<EditorMenu onWorldDetails={vi.fn()} onMapDetails={vi.fn()} onHelp={vi.fn()} open />);
    expect(screen.getByText("Edit world details")).toBeInTheDocument();
    expect(screen.getByText("Edit map details")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
  });
});
