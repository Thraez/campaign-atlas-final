import { useCallback, useState } from "react";
import type { PublishCheckResult, PublishPushResult } from "./publishTypes";

export type PublishState =
  | "idle"
  | "checking"
  | "ready"
  | "blocked"
  | "build-failed"
  | "busy"
  | "error"
  | "publishing"
  | "published"
  | "nothing-to-publish"
  | "git-failed";

export function usePublishFlow() {
  const [state, setState] = useState<PublishState>("idle");
  const [checkResult, setCheckResult] = useState<PublishCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushReason, setPushReason] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      const res = await fetch("/__atlas/publish-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 423) {
        setState("busy");
        return;
      }
      if (!res.ok) {
        setState("error");
        setError(`Check failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as PublishCheckResult;
      setCheckResult(data);
      if (data.verdict === "safe") setState("ready");
      else if (data.verdict === "build-failed") setState("build-failed");
      else setState("blocked");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const confirm = useCallback(async () => {
    setState("publishing");
    try {
      const res = await fetch("/__atlas/publish-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.status === 423) {
        setState("busy");
        return;
      }
      if (!res.ok) {
        setState("error");
        setError(`Publish failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as PublishPushResult;
      if (data.status === "published") {
        setState("published");
      } else if (data.status === "nothing-to-publish") {
        setState("nothing-to-publish");
      } else if (data.status === "blocked") {
        setState("blocked");
      } else if (data.status === "git-failed") {
        setState("git-failed");
        setPushReason(data.reason);
      }
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { state, checkResult, error, check, confirm, pushReason };
}
