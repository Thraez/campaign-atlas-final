import { describe, it, expect, vi } from "vitest";

const rawError = vi.fn();
const rawSuccess = vi.fn();

vi.mock("sonner", () => ({
  Toaster: vi.fn(),
  toast: { error: rawError, success: rawSuccess, warning: vi.fn(), info: vi.fn() },
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system" }) }));

describe("toast.error persistence (S10)", () => {
  it("defaults error toasts to an infinite duration so they don't auto-dismiss", async () => {
    const { toast } = await import("@/components/ui/sonner");

    toast.error("Save failed");

    expect(rawError).toHaveBeenCalledWith("Save failed", { duration: Infinity });
  });

  it("lets a caller-supplied duration or other option override the default", async () => {
    const { toast } = await import("@/components/ui/sonner");

    toast.error("Save failed", { id: "save-failed", duration: 8000 });

    expect(rawError).toHaveBeenCalledWith("Save failed", { duration: 8000, id: "save-failed" });
  });

  it("leaves other toast types on their normal auto-dismiss behavior", async () => {
    const { toast } = await import("@/components/ui/sonner");

    toast.success("Saved");

    expect(rawSuccess).toHaveBeenCalledWith("Saved");
  });
});
