/**
 * DM-tools gate tests.
 *
 * Verifies that the editor route (/atlas/edit) and visible "Edit pins" /
 * "Placements" links are gated behind `isDmToolsEnabled()`. Production
 * default (DEV=false, flag missing) MUST be locked. Setting
 * VITE_ENABLE_DM_TOOLS=true must unlock both link + route. Dev default
 * stays unlocked for editor convenience.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React, { Suspense } from "react";

function setEnv({ dev, flag }: { dev: boolean; flag?: string }) {
  vi.stubEnv("DEV", dev);
  if (flag === undefined) vi.stubEnv("VITE_ENABLE_DM_TOOLS", "");
  else vi.stubEnv("VITE_ENABLE_DM_TOOLS", flag);
}

async function loadGate() {
  vi.resetModules();
  return await import("@/atlas/dmTools");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isDmToolsEnabled()", () => {
  it("production with flag missing → disabled", async () => {
    setEnv({ dev: false });
    const { isDmToolsEnabled } = await loadGate();
    expect(isDmToolsEnabled()).toBe(false);
  });

  it("production with VITE_ENABLE_DM_TOOLS=true → enabled", async () => {
    setEnv({ dev: false, flag: "true" });
    const { isDmToolsEnabled } = await loadGate();
    expect(isDmToolsEnabled()).toBe(true);
  });

  it("production with VITE_ENABLE_DM_TOOLS=false → disabled", async () => {
    setEnv({ dev: false, flag: "false" });
    const { isDmToolsEnabled } = await loadGate();
    expect(isDmToolsEnabled()).toBe(false);
  });

  it("dev with flag missing → enabled (convenience default)", async () => {
    setEnv({ dev: true });
    const { isDmToolsEnabled } = await loadGate();
    expect(isDmToolsEnabled()).toBe(true);
  });

  it("dev with VITE_ENABLE_DM_TOOLS=false → disabled (explicit override wins)", async () => {
    setEnv({ dev: true, flag: "false" });
    const { isDmToolsEnabled } = await loadGate();
    expect(isDmToolsEnabled()).toBe(false);
  });
});

/**
 * Mock the heavy editor + viewer pages with cheap stand-ins. We only care
 * that the route gate decides between editor and not-found, not about the
 * full editor render path.
 */
vi.mock("@/pages/AtlasPlacementEditor.tsx", () => ({
  default: () => <div data-testid="editor-mounted">EDITOR</div>,
}));
vi.mock("@/pages/NotFound.tsx", () => ({
  default: () => <div data-testid="not-found">NOT FOUND</div>,
}));

/** Tiny copy of the App route gate, importing the same dmTools module. */
function renderEditorRoute() {
  // Dynamic require so we get the freshly-stubbed env on each render.
  const { isDmToolsEnabled } = require("@/atlas/dmTools") as typeof import("@/atlas/dmTools");
  const Editor = require("@/pages/AtlasPlacementEditor.tsx").default as React.FC;
  const NotFound = require("@/pages/NotFound.tsx").default as React.FC;
  const Gate = () => (isDmToolsEnabled() ? <Editor /> : <NotFound />);
  render(
    <MemoryRouter initialEntries={["/atlas/edit"]}>
      <Suspense fallback={<div>loading</div>}>
        <Routes>
          <Route path="/atlas/edit" element={<Gate />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}

describe("/atlas/edit route gate", () => {
  beforeEach(() => vi.resetModules());

  it("production with flag missing → /atlas/edit renders NotFound, not editor", async () => {
    setEnv({ dev: false });
    renderEditorRoute();
    expect(screen.queryByTestId("editor-mounted")).toBeNull();
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
  });

  it("production with VITE_ENABLE_DM_TOOLS=true → /atlas/edit renders the editor", async () => {
    setEnv({ dev: false, flag: "true" });
    renderEditorRoute();
    expect(screen.getByTestId("editor-mounted")).toBeInTheDocument();
    expect(screen.queryByTestId("not-found")).toBeNull();
  });

  it("dev default → /atlas/edit renders the editor", async () => {
    setEnv({ dev: true });
    renderEditorRoute();
    expect(screen.getByTestId("editor-mounted")).toBeInTheDocument();
  });
});

describe("Landing tile gating", () => {
  beforeEach(() => vi.resetModules());

  async function renderLanding() {
    const { default: Landing } = await import("@/pages/Landing.tsx");
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );
  }

  it("production with flag missing → no editor tile or 'Edit pins' link", async () => {
    setEnv({ dev: false });
    await renderLanding();
    expect(screen.queryByText(/DM Placement & Map Editor/i)).toBeNull();
    // No anchor pointing at the editor route should be in the DOM.
    const editorLinks = document.querySelectorAll('a[href="/atlas/edit"]');
    expect(editorLinks.length).toBe(0);
  });

  it("production with VITE_ENABLE_DM_TOOLS=true → editor tile is present", async () => {
    setEnv({ dev: false, flag: "true" });
    await renderLanding();
    expect(screen.getByText(/DM Placement & Map Editor/i)).toBeInTheDocument();
    const editorLinks = document.querySelectorAll('a[href="/atlas/edit"]');
    expect(editorLinks.length).toBeGreaterThan(0);
  });

  it("dev default → editor tile is present", async () => {
    setEnv({ dev: true });
    await renderLanding();
    expect(screen.getByText(/DM Placement & Map Editor/i)).toBeInTheDocument();
  });
});