import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AtlasLoader } from "@/atlas/content/AtlasLoader";
import { _resetLoaderForTests } from "@/atlas/content/atlasLoaderShown";
import { _resetCalmModeForTests, setCalmMode } from "@/hooks/use-reduce-motion";

const originalMatchMedia = window.matchMedia;

function osReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const hasMotion = (container: HTMLElement) =>
  container.querySelector(".atlas-loader-motion, .atlas-loader-needle") !== null;

describe("AtlasLoader (P-08)", () => {
  const originalTitle = document.title;
  beforeEach(() => {
    _resetCalmModeForTests();
    _resetLoaderForTests();
    osReducedMotion(false);
    document.title = "Lantern Road";
  });
  afterEach(() => {
    _resetCalmModeForTests();
    document.title = originalTitle;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("announces its label as a status and names the site from the page title", () => {
    render(<AtlasLoader label="Loading timeline…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading timeline…");
    expect(screen.getByText("Lantern Road")).toBeInTheDocument();
  });

  it("hides the compass drawing from screen readers", () => {
    const { container } = render(<AtlasLoader />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("fades in only on the first loader of the page load", () => {
    const first = render(<AtlasLoader />);
    expect(first.container.querySelector(".atlas-loader-motion")).not.toBeNull();
    first.unmount();
    const second = render(<AtlasLoader />);
    expect(second.container.querySelector(".atlas-loader-motion")).toBeNull();
    expect(second.container.querySelector(".atlas-loader-needle")).not.toBeNull();
  });

  it("says Loading atlas… by default", () => {
    render(<AtlasLoader />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading atlas…");
  });

  it("falls back to Atlas when the page has no title", () => {
    document.title = "";
    render(<AtlasLoader />);
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });

  it("moves when nothing asks for less motion", () => {
    const { container } = render(<AtlasLoader />);
    expect(hasMotion(container)).toBe(true);
  });

  it("has no motion class under calm mode", () => {
    setCalmMode(true);
    const { container } = render(<AtlasLoader />);
    expect(hasMotion(container)).toBe(false);
  });

  it("has no motion class under the OS reduced-motion setting", () => {
    osReducedMotion(true);
    const { container } = render(<AtlasLoader />);
    expect(hasMotion(container)).toBe(false);
  });
});
