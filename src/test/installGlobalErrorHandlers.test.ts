import { describe, it, expect, vi, afterEach } from "vitest";
import { installGlobalErrorHandlers } from "@/lib/installGlobalErrorHandlers";
import { logger } from "@/lib/logger";

function dispatchRejection(reason: unknown) {
  const event = new Event("unhandledrejection") as PromiseRejectionEvent;
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
}

function dispatchWindowError(error: unknown, message = "") {
  const event = new Event("error") as ErrorEvent;
  Object.defineProperty(event, "error", { value: error });
  Object.defineProperty(event, "message", { value: message });
  window.dispatchEvent(event);
}

describe("installGlobalErrorHandlers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("forwards an unhandledrejection event to logger.error", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    installGlobalErrorHandlers();

    dispatchRejection(new Error("rejected"));

    expect(spy).toHaveBeenCalledWith("[unhandledrejection]", expect.any(Error));
  });

  it("forwards a window error event to logger.error", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    installGlobalErrorHandlers();

    const err = new Error("boom");
    dispatchWindowError(err);

    expect(spy).toHaveBeenCalledWith("[window error]", err);
  });

  it("is idempotent — calling it again does not double-register the listeners", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => {});
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    installGlobalErrorHandlers();

    dispatchRejection(new Error("once"));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
