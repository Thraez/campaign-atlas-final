import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast } from "sonner";
import { downloadText } from "@/atlas/tabs/download";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const FAKE_OBJECT_URL = "blob:mock-download-abc";

// jsdom does not implement URL.createObjectURL / revokeObjectURL — define them.
const createObjectURL = vi.fn((_blob: Blob | MediaSource) => FAKE_OBJECT_URL);
const revokeObjectURL = vi.fn();
Object.defineProperty(URL, "createObjectURL", {
  value: createObjectURL,
  writable: true,
  configurable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: revokeObjectURL,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function withMockedAnchor(fn: () => void): HTMLAnchorElement {
  let anchor!: HTMLAnchorElement;
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    const el = origCreate(tagName);
    if (tagName === "a") {
      vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {});
      anchor = el as HTMLAnchorElement;
    }
    return el;
  });
  fn();
  return anchor;
}

describe("downloadText", () => {
  it("creates an anchor with the correct filename, clicks it, revokes the object URL, and toasts", () => {
    const anchor = withMockedAnchor(() => downloadText("export.md", "# World", "text/markdown"));

    expect(anchor.download).toBe("export.md");
    const createdBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(createdBlob.type).toBe("text/markdown");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(FAKE_OBJECT_URL);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Downloaded export.md");
  });

  it("puts the body text in the blob with the correct size and mime type", () => {
    const body = "hello world";
    withMockedAnchor(() => downloadText("notes.txt", body, "text/plain"));

    const createdBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(createdBlob.type).toBe("text/plain");
    expect(createdBlob.size).toBe(new Blob([body]).size);
  });
});
