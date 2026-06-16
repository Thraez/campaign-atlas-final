import { describe, it, expect } from "vitest";
import { classifyGitFailure } from "./runPublishPush";

describe("classifyGitFailure", () => {
  it("offline", () =>
    expect(
      classifyGitFailure("fatal: unable to access 'https://…': Could not resolve host: github.com"),
    ).toBe("offline"));

  it("auth", () =>
    expect(classifyGitFailure("fatal: Authentication failed for 'https://…'")).toBe("auth"));

  it("behind", () =>
    expect(
      classifyGitFailure("! [rejected]  main -> main (non-fast-forward)"),
    ).toBe("behind"));

  it("conflict", () =>
    expect(classifyGitFailure("CONFLICT (content): Merge conflict in x")).toBe("conflict"));

  it("unknown", () =>
    expect(classifyGitFailure("some other git noise")).toBe("unknown"));
});
