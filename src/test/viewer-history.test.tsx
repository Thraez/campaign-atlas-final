import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { BrowserRouter, useNavigate, type NavigateFunction } from "react-router";
import { pushViewerSearch, replaceViewerSearch } from "@/atlas/viewerHistory";

type RouterState = { key?: string; idx?: number } | null;
const state = () => window.history.state as RouterState;

let navigate: NavigateFunction;
function Capture() {
  navigate = useNavigate();
  return null;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/atlas");
  render(
    <BrowserRouter>
      <Capture />
    </BrowserRouter>,
  );
});
afterEach(cleanup);

describe("viewer history writes keep react-router's index", () => {
  it("the router seeds idx 0 on the first entry", () => {
    expect(state()?.idx).toBe(0);
  });

  it("push bumps idx with a fresh key; replace keeps both", () => {
    pushViewerSearch("map=a&entity=x");
    const pushed = state();
    expect(pushed?.idx).toBe(1);
    expect(pushed?.key).toMatch(/^[a-z0-9]+$/);
    expect(window.location.search).toBe("?map=a&entity=x");

    replaceViewerSearch("map=a&entity=x&cx=1&cy=2");
    expect(state()).toEqual(pushed);
    expect(window.location.search).toBe("?map=a&entity=x&cx=1&cy=2");
  });

  it("a router navigation after viewer writes counts on from the right index", () => {
    pushViewerSearch("map=a");
    pushViewerSearch("map=a&entity=x");
    replaceViewerSearch("map=a&entity=x&cx=1&cy=2");
    act(() => navigate("/atlas/timeline"));
    expect(state()?.idx).toBe(3);
  });

  it("raw pushState(null) loses the index (why the helpers exist)", () => {
    window.history.pushState(null, "", "?map=a");
    window.history.pushState(null, "", "?map=a&entity=x");
    act(() => navigate("/atlas/timeline"));
    // Fourth entry, but the router counted from a null index.
    expect(state()?.idx).not.toBe(3);
  });
});
