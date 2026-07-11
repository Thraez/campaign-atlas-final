import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../../scripts/atlas/parseFrontmatter";

function parse(yaml: string) {
  return parseFrontmatter(yaml, "test/entity.md");
}

describe("parseSecrets", () => {
  it("parses a valid password secret", () => {
    const { atlas, warnings } = parse(`---
atlas:
  secrets:
    - id: ward
      password: "the tide"
      teaser: "a sealed box"
      reveal: "the ward answers"
---
body`);
    expect(warnings).toHaveLength(0);
    expect(atlas.secrets).toHaveLength(1);
    expect(atlas.secrets![0]).toMatchObject({
      id: "ward",
      password: "the tide",
      teaser: "a sealed box",
      reveal: "the ward answers",
    });
    expect(atlas.secrets![0].for).toBeUndefined();
  });

  it("parses a valid character secret", () => {
    const { atlas, warnings } = parse(`---
atlas:
  secrets:
    - id: signet
      for: vesper
      reveal: "you know the ring"
---
body`);
    expect(warnings).toHaveLength(0);
    expect(atlas.secrets![0]).toMatchObject({
      id: "signet",
      for: "vesper",
      reveal: "you know the ring",
    });
    expect(atlas.secrets![0].teaser).toBeUndefined();
  });

  it("warns and skips a secret with both for and password", () => {
    const { atlas, warnings } = parse(`---
atlas:
  secrets:
    - id: bad
      for: vesper
      password: wrong
      reveal: x
---
body`);
    expect(atlas.secrets).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/both 'for' and 'password'/);
  });

  it("warns and skips a secret with neither for nor password", () => {
    const { atlas, warnings } = parse(`---
atlas:
  secrets:
    - id: bad
      reveal: x
---
body`);
    expect(atlas.secrets).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/neither 'for' nor 'password'/);
  });

  it("warns and skips a secret missing reveal", () => {
    const { atlas, warnings } = parse(`---
atlas:
  secrets:
    - id: bad
      password: key
---
body`);
    expect(atlas.secrets).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/missing required 'reveal'/);
  });

  it("parses secretId on a placement", () => {
    const { atlas } = parse(`---
atlas:
  placements:
    - x: 10
      y: 20
      secretId: ward
---
body`);
    expect(atlas.placements![0].secretId).toBe("ward");
  });
});
