// src/test/tabs/TabFrame.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TabFrame } from "@/atlas/tabs/TabFrame";

function base(overrides: Partial<Parameters<typeof TabFrame>[0]> = {}) {
  return {
    title: "Test Tab",
    builtFromYamlCount: 3,
    localDraftCount: 0,
    children: <span>child content</span>,
    ...overrides,
  };
}

describe("TabFrame", () => {
  it("renders title and YAML count badge", () => {
    render(<TabFrame {...base()} />);
    expect(screen.getByText("Test Tab")).toBeTruthy();
    expect(screen.getByText("3 from YAML")).toBeTruthy();
  });

  it("draft badge shows zero count in outline variant", () => {
    render(<TabFrame {...base({ localDraftCount: 0 })} />);
    expect(screen.getByText("0 draft")).toBeTruthy();
  });

  it("draft badge shows non-zero count", () => {
    render(<TabFrame {...base({ localDraftCount: 2 })} />);
    expect(screen.getByText("2 draft")).toBeTruthy();
  });

  it("blocking badge absent when blockingCount is 0 (default)", () => {
    render(<TabFrame {...base()} />);
    expect(screen.queryByText(/blocking/)).toBeNull();
  });

  it("blocking badge shown when blockingCount > 0", () => {
    render(<TabFrame {...base({ blockingCount: 2 })} />);
    expect(screen.getByText("2 blocking")).toBeTruthy();
  });

  it("warning badge absent when warningCount is 0 (default)", () => {
    render(<TabFrame {...base()} />);
    expect(screen.queryByText(/warning/)).toBeNull();
  });

  it("warning badge shown when warningCount > 0", () => {
    render(<TabFrame {...base({ warningCount: 5 })} />);
    expect(screen.getByText("5 warning")).toBeTruthy();
  });

  it("YAML preview toggle absent when rawYamlPreview is undefined", () => {
    render(<TabFrame {...base({ rawYamlPreview: undefined })} />);
    expect(screen.queryByText(/advanced yaml preview/i)).toBeNull();
  });

  it("YAML preview toggle present when rawYamlPreview is provided", () => {
    render(<TabFrame {...base({ rawYamlPreview: "key: value" })} />);
    expect(screen.getByText(/advanced yaml preview/i)).toBeTruthy();
  });

  it("YAML content hidden by default, shown after toggle click", () => {
    render(<TabFrame {...base({ rawYamlPreview: "key: value" })} />);
    expect(screen.queryByText("key: value")).toBeNull();
    fireEvent.click(screen.getByText(/advanced yaml preview/i));
    expect(screen.getByText("key: value")).toBeTruthy();
  });

  it("YAML toggle click again hides the content", () => {
    render(<TabFrame {...base({ rawYamlPreview: "key: value" })} />);
    const toggle = screen.getByText(/advanced yaml preview/i);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText("key: value")).toBeNull();
  });

  it("empty rawYamlPreview shows placeholder text after toggle", () => {
    render(<TabFrame {...base({ rawYamlPreview: "" })} />);
    fireEvent.click(screen.getByText(/advanced yaml preview/i));
    expect(screen.getByText("# (nothing to preview)")).toBeTruthy();
  });

  it("renders children", () => {
    render(<TabFrame {...base()} />);
    expect(screen.getByText("child content")).toBeTruthy();
  });
});
