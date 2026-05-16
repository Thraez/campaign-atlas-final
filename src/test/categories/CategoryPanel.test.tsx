import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryPanel } from "@/atlas/categories/CategoryPanel";

const entities = [
  { id: "a", title: "Alda", type: "npc", dateValue: 1 },
  { id: "b", title: "Borin", type: "npc", dateValue: 9 },
] as never[];

describe("CategoryPanel", () => {
  it("lists only this category, recency-sorted (newest first)", () => {
    render(
      <CategoryPanel category="characters" entities={entities}
        onOpen={vi.fn()} onNew={vi.fn()} onImport={vi.fn()} />,
    );
    const rows = screen.getAllByTestId("entity-row").map((r) => r.textContent);
    expect(rows[0]).toContain("Borin"); // dateValue 9 first
  });

  it("filters by the search box", () => {
    render(
      <CategoryPanel category="characters" entities={entities}
        onOpen={vi.fn()} onNew={vi.fn()} onImport={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/search characters/i), {
      target: { value: "ald" },
    });
    expect(screen.queryByText("Borin")).toBeNull();
    expect(screen.getByText("Alda")).toBeInTheDocument();
  });

  it("shows the empty stub with New + Import when the category is empty", () => {
    const onNew = vi.fn();
    render(
      <CategoryPanel category="items" entities={[]}
        onOpen={vi.fn()} onNew={onNew} onImport={vi.fn()} />,
    );
    expect(screen.getByText(/No items yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New Item/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
