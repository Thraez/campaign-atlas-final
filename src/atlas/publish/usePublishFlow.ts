import { useCallback, useState } from "react";
import type { PublishCheckResult } from "./publishTypes";

export type PublishState =
  | "idle"
  | "checking"
  | "ready"
  | "blocked"
  | "build-failed"
  | "busy"
  | "error";

export function usePublishFlow() {
  const [state, setState] = useState<PublishState>("idle");
  const [checkResult, setCheckResult] = useState<PublishCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return { state, checkResult, error, check };
}
