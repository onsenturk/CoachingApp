"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";

type State = "idle" | "pending" | "ok" | "err";

export function SyncNowButton() {
  const [state, setState] = useState<State>("idle");

  // Auto-reset success/error back to idle so the button stays usable.
  useEffect(() => {
    if (state === "ok" || state === "err") {
      const t = setTimeout(() => setState("idle"), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <Button
        variant={state === "err" ? "destructive" : "secondary"}
        size="sm"
        loading={state === "pending"}
        onClick={async () => {
          setState("pending");
          try {
            const r = await fetch("/api/strava/sync", { method: "POST" });
            setState(r.ok ? "ok" : "err");
          } catch {
            setState("err");
          }
        }}
      >
        {state === "pending"
          ? "Syncing"
          : state === "ok"
            ? "Sync queued ✓"
            : state === "err"
              ? "Sync failed"
              : "Sync now"}
      </Button>
      {/* Live region for screen readers — visible status text is enough for sighted users */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "pending"
          ? "Syncing activities"
          : state === "ok"
            ? "Sync queued"
            : state === "err"
              ? "Sync failed"
              : ""}
      </span>
    </>
  );
}
