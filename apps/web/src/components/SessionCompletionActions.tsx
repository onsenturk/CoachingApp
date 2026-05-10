"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

type State =
  | "idle"
  | "marking"
  | "syncing"
  | "done"
  | "queued"
  | "no-match"
  | "error";

export function SessionCompletionActions({
  sessionId,
  status,
}: {
  sessionId: string;
  status: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (["done", "queued", "no-match", "error"].includes(state)) {
      const timeout = setTimeout(() => setState("idle"), 4000);
      return () => clearTimeout(timeout);
    }
  }, [state]);

  const isDone = status === "done";

  async function markDone() {
    setState("marking");
    try {
      const response = await fetch(
        `/api/planned-sessions/${sessionId}/complete`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("mark failed");
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  async function syncAndMatch() {
    setState("syncing");
    try {
      const sync = await fetch("/api/strava/sync", { method: "POST" });
      if (!sync.ok) throw new Error("sync failed");

      const match = await fetch(
        `/api/planned-sessions/${sessionId}/match-activity`,
        { method: "POST" },
      );
      if (!match.ok) throw new Error("match failed");
      const payload = (await match.json()) as { matched?: boolean };
      setState(payload.matched ? "done" : "queued");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={isDone ? "secondary" : "primary"}
        size="sm"
        loading={state === "marking"}
        disabled={isDone || state === "syncing"}
        onClick={markDone}
      >
        {isDone ? "Completed" : state === "done" ? "Marked done" : "Mark done"}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        loading={state === "syncing"}
        disabled={isDone || state === "marking"}
        onClick={syncAndMatch}
      >
        {state === "syncing" ? "Checking" : "Sync & match"}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className="min-w-full text-[11px] text-neutral-500"
      >
        {state === "queued"
          ? "Sync queued. Try again after the worker finishes if no match appears yet."
          : state === "no-match"
            ? "No matching activity found yet."
            : state === "error"
              ? "Could not update this session."
              : ""}
      </span>
    </div>
  );
}
