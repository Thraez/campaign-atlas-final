import { describe, it, expect } from "vitest";
import { entityHref } from "@/atlas/deepLink";

describe("entityHref", () => {
  it("points at the viewer with the entity id", () => {
    expect(entityHref("corven")).toBe("/atlas?entity=corven");
  });

  it("URI-encodes spaces and reserved characters", () => {
    expect(entityHref("old keep/#1&x")).toBe("/atlas?entity=old%20keep%2F%231%26x");
  });
});
