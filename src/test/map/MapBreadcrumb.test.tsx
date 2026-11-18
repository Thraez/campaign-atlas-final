import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapBreadcrumb } from "@/atlas/map/MapBreadcrumb";
import type { MapTree, MapTreeNode } from "@/atlas/ocean/mapTree";
import { makeMap } from "../helpers/makeProject";

// ocean > a > b > c > d: five levels.
function chainTree(): MapTree {
  const ids = ["a", "b", "c", "d"];
  const byId = new Map<string, MapTreeNode>();
  ids.forEach((id, i) => {
    byId.set(id, {
      map: makeMap({ id, name: `Map ${id.toUpperCase()}` }),
      parentId: i === 0 ? null : ids[i - 1],
      placement: null,
      children: [],
    });
  });
  return {
    ocean: { width: 1000, height: 1000, sea: "#000" },
    roots: [byId.get("a")!],
    byId,
    dropped: [],
    warnings: [],
  };
}

afterEach(cleanup);

describe("MapBreadcrumb, compact (R-38)", () => {
  it("folds earlier levels of a deep trail into a menu that lists exactly them", async () => {
    const onGo = vi.fn();
    render(
      <MapBreadcrumb tree={chainTree()} view={{ kind: "map", mapId: "d" }} onGo={onGo} compact />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // Shown: the last two levels; the rest sit behind "…".
    expect(within(nav).getByRole("button", { name: "Map C" })).toBeInTheDocument();
    expect(within(nav).getByText("Map D")).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("button", { name: "Map B" })).not.toBeInTheDocument();
    fireEvent.keyDown(within(nav).getByRole("button", { name: "Earlier levels" }), {
      key: "Enter",
    });
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Ocean", "Map A", "Map B"]);
    fireEvent.click(items[2]);
    expect(onGo).toHaveBeenLastCalledWith({ kind: "map", mapId: "b" });
  });

  it("each hidden level goes to its own id", async () => {
    const expected = [{ kind: "ocean" }, { kind: "map", mapId: "a" }, { kind: "map", mapId: "b" }];
    for (let i = 0; i < 3; i++) {
      const onGo = vi.fn();
      render(
        <MapBreadcrumb tree={chainTree()} view={{ kind: "map", mapId: "d" }} onGo={onGo} compact />,
      );
      fireEvent.keyDown(screen.getByRole("button", { name: "Earlier levels" }), { key: "Enter" });
      fireEvent.click((await screen.findAllByRole("menuitem"))[i]);
      expect(onGo).toHaveBeenCalledWith(expected[i]);
      cleanup();
    }
  });

  it("does not fold a short trail", () => {
    render(
      <MapBreadcrumb
        tree={chainTree()}
        view={{ kind: "map", mapId: "b" }}
        onGo={() => {}}
        compact
      />,
    );
    expect(screen.queryByRole("button", { name: "Earlier levels" })).not.toBeInTheDocument();
  });
});
