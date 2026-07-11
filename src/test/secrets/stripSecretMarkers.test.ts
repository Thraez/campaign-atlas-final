import { describe, it, expect } from "vitest";
import { stripSecretMarkers } from "../../../scripts/atlas/stripSecretMarkers";

describe("stripSecretMarkers", () => {
  it("removes a single marker and leaves surrounding text", () => {
    expect(stripSecretMarkers("He keeps ledgers. {{secret:signet}} The rest trusts him."))
      .toBe("He keeps ledgers.  The rest trusts him.");
  });

  it("removes multiple markers", () => {
    expect(stripSecretMarkers("a {{secret:x}} b {{secret:y}} c")).toBe("a  b  c");
  });

  it("leaves text with no markers untouched", () => {
    expect(stripSecretMarkers("nothing here")).toBe("nothing here");
  });

  it("does not remove other {{...}} patterns", () => {
    expect(stripSecretMarkers("{{other:thing}} stays")).toBe("{{other:thing}} stays");
  });
});
