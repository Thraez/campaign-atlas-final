import { describe, it, expect } from "vitest";
import { stripDmBlocks as fromSrc } from "@/atlas/content/stripDmBlocks";
import { stripDmBlocks as fromScripts } from "../../../scripts/atlas/stripDmBlocks";

const SAMPLE = `Visible.

%%
## DM Notes
secret truth
%%

More visible.

:::dm
callout secret
:::

End.
`;

describe("stripDmBlocks parity (one source of truth)", () => {
  it("src and scripts entrypoints produce byte-identical output", () => {
    expect(fromSrc(SAMPLE)).toEqual(fromScripts(SAMPLE));
  });
  it("hides %% and :::dm content", () => {
    const out = fromSrc(SAMPLE).text;
    expect(out).not.toContain("secret truth");
    expect(out).not.toContain("callout secret");
    expect(out).toContain("Visible.");
    expect(out).toContain("End.");
  });
});
