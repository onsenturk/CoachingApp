"use client";
import { useState } from "react";

export function SyncNowButton() {
  const [state, setState] = useState<"idle" | "pending" | "ok" | "err">("idle");
  return (
    <button
      type="button"
      disabled={state === "pending"}
      onClick={async () => {
        setState("pending");
        try {
          const r = await fetch("/api/strava/sync", { method: "POST" });
          setState(r.ok ? "ok" : "err");
        } catch {
          setState("err");
        }
      }}
      className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-60"
    >
      {state === "pending"
        ? "Syncing…"
        : state === "ok"
          ? "Sync queued"
          : state === "err"
            ? "Sync failed"
            : "Sync now"}
    </button>
  );
}
