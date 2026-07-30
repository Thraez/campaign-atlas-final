import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AtlasNavMenu } from "@/atlas/AtlasNavMenu";

function renderMenu(props: Parameters<typeof AtlasNavMenu>[0] = {}) {
  return render(
    <MemoryRouter>
      <AtlasNavMenu {...props} />
    </MemoryRouter>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /open navigation menu/i }));
}

describe("AtlasNavMenu worldName", () => {
  it("shows the supplied worldName in the sheet title", () => {
    renderMenu({ worldName: "Astrath Deeprealm" });
    openMenu();
    expect(screen.getByText("Astrath Deeprealm")).toBeInTheDocument();
  });

  it("falls back to 'Atlas' when worldName is omitted", () => {
    renderMenu();
    openMenu();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });

  it("falls back to 'Atlas' when worldName is undefined", () => {
    renderMenu({ worldName: undefined });
    openMenu();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });
});
