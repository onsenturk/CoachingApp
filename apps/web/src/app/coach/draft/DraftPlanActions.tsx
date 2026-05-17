"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/Button";

export function DraftPlanActions({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [acceptPending, startAcceptTransition] = useTransition();
  const [discardPending, startDiscardTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function acceptDraft() {
    setError(null);
    startAcceptTransition(async () => {
      const res = await fetch(
        `/api/program/${encodeURIComponent(draftId)}/accept`,
        {
          method: "POST",
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? `Accept failed (${res.status}).`);
        return;
      }
      router.push("/calendar");
      router.refresh();
    });
  }

  function discardDraft() {
    setError(null);
    startDiscardTransition(async () => {
      const res = await fetch(
        `/api/program/${encodeURIComponent(draftId)}/discard`,
        {
          method: "POST",
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? `Discard failed (${res.status}).`);
        return;
      }
      router.push("/coach");
      router.refresh();
    });
  }

  const busy = acceptPending || discardPending;

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      <Button
        type="button"
        variant="primary"
        size="md"
        fullWidth
        loading={acceptPending}
        disabled={busy}
        onClick={acceptDraft}
      >
        Accept and activate plan
      </Button>
      <Link
        href="/coach"
        aria-disabled={busy}
        className={buttonClasses({
          variant: "secondary",
          size: "md",
          fullWidth: true,
          className: busy ? "pointer-events-none opacity-50" : "",
        })}
      >
        Edit parameters
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="md"
        fullWidth
        loading={discardPending}
        disabled={busy}
        onClick={discardDraft}
      >
        Discard draft
      </Button>
    </div>
  );
}
