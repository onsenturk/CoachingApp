"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PROGRESS_STEPS = [
  "Analyzing your baseline fitness…",
  "Calling the AI coach…",
  "Periodizing weekly volume and intensity…",
  "Scheduling key sessions and recovery days…",
  "Validating the plan against safety rules…",
] as const;

const PRESETS = [
  { id: "5k", label: "5K", distanceM: 5_000 },
  { id: "10k", label: "10K", distanceM: 10_000 },
  { id: "half", label: "Half marathon", distanceM: 21_097.5 },
  { id: "marathon", label: "Marathon", distanceM: 42_195 },
  { id: "custom", label: "Custom", distanceM: 0 },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

function defaultGoalDateIso(weeks = 6): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function parseHmsToSec(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  let sec = 0;
  if (parts.length === 3) sec = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  else if (parts.length === 2) sec = parts[0]! * 60 + parts[1]!;
  else if (parts.length === 1) sec = parts[0]!;
  else return null;
  return sec > 0 ? sec : null;
}

export function GoalForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [goalType, setGoalType] = useState<PresetId>("half");
  const [customKm, setCustomKm] = useState("10");
  const [targetTime, setTargetTime] = useState("");
  const [weeksTotal, setWeeksTotal] = useState(6);
  const [sessionsPerWk, setSessionsPerWk] = useState(4);
  const [goalDate, setGoalDate] = useState(defaultGoalDateIso(6));
  const [error, setError] = useState<string | null>(null);
  const [feasibilityHint, setFeasibilityHint] = useState<{
    reason: string;
    altSec?: number;
    altWeeks?: number;
  } | null>(null);
  const [progressIdx, setProgressIdx] = useState(0);

  useEffect(() => {
    if (!pending) {
      setProgressIdx(0);
      return;
    }
    const id = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 4000);
    return () => clearInterval(id);
  }, [pending]);

  function onWeeksChange(weeks: number) {
    setWeeksTotal(weeks);
    setGoalDate(defaultGoalDateIso(weeks));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeasibilityHint(null);

    const distanceM =
      goalType === "custom"
        ? Number(customKm) * 1000
        : PRESETS.find((p) => p.id === goalType)!.distanceM;
    if (!distanceM || distanceM <= 0) {
      setError("Pick a distance.");
      return;
    }
    const targetTimeSec = parseHmsToSec(targetTime) ?? undefined;

    const payload = {
      goalType,
      distanceM,
      targetTimeSec,
      goalDate,
      weeksTotal,
      sessionsPerWk,
      sport: "run" as const,
    };

    startTransition(async () => {
      const res = await fetch("/api/program/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/calendar");
        router.refresh();
        return;
      }
      const json = await res.json().catch(() => null);
      if (res.status === 422 && json?.feasibility === "red") {
        setFeasibilityHint({
          reason: json.reason ?? "Goal looks too aggressive for current fitness.",
          altSec: json.suggestedAlternativeTimeSec,
          altWeeks: json.suggestedAlternativeWeeks,
        });
        return;
      }
      if (Array.isArray(json?.violations) && json.violations.length > 0) {
        const lines = json.violations
          .slice(0, 5)
          .map((v: { message?: string; code?: string }) => `• ${v.message ?? v.code}`)
          .join("\n");
        setError(
          `${json.error ?? "Plan failed safety checks"}:\n${lines}\n\nTry fewer sessions/week or a longer plan window.`,
        );
        return;
      }
      setError(json?.error ?? `Request failed (${res.status}).`);
    });
  }

  return (
    <form className="relative space-y-5" onSubmit={onSubmit}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">Race distance</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setGoalType(p.id)}
              className={`rounded border px-3 py-1.5 text-sm ${
                goalType === p.id
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 hover:border-neutral-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {goalType === "custom" && (
          <label className="mt-2 block text-sm">
            <span className="text-neutral-600">Distance (km)</span>
            <input
              type="number"
              min={3}
              max={100}
              step={0.5}
              value={customKm}
              onChange={(e) => setCustomKm(e.target.value)}
              className="mt-1 w-32 rounded border border-neutral-300 p-2"
            />
          </label>
        )}
      </fieldset>

      <label className="block text-sm">
        <span className="text-neutral-700">Target finish time (optional)</span>
        <input
          type="text"
          placeholder="hh:mm:ss e.g. 1:45:00"
          value={targetTime}
          onChange={(e) => setTargetTime(e.target.value)}
          className="mt-1 w-48 rounded border border-neutral-300 p-2 font-mono"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Leave blank to just complete the distance.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-neutral-700">Weeks of training</span>
          <input
            type="number"
            min={4}
            max={16}
            value={weeksTotal}
            onChange={(e) => onWeeksChange(Number(e.target.value))}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Sessions / week</span>
          <input
            type="number"
            min={3}
            max={7}
            value={sessionsPerWk}
            onChange={(e) => setSessionsPerWk(Number(e.target.value))}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Race day</span>
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 p-2"
          />
        </label>
      </div>

      {error && (
        <div className="whitespace-pre-line rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {feasibilityHint && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">That target looks aggressive.</div>
          <p className="mt-1">{feasibilityHint.reason}</p>
          {feasibilityHint.altSec && (
            <p className="mt-2 text-xs">
              Suggested alternative finish time: ~
              {fmtTime(feasibilityHint.altSec)}
              {feasibilityHint.altWeeks
                ? ` over ${feasibilityHint.altWeeks} weeks.`
                : "."}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Generating plan…" : "Generate plan"}
      </button>

      {pending && (
        <div
          aria-live="polite"
          aria-busy="true"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85 backdrop-blur-sm"
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900"
            role="status"
            aria-label="Generating plan"
          />
          <div className="text-sm font-medium text-neutral-900">
            AI coach is generating your program
          </div>
          <div className="text-xs text-neutral-600">
            {PROGRESS_STEPS[progressIdx]}
          </div>
          <div className="text-[11px] text-neutral-500">
            This usually takes 15–30 seconds. Please don&apos;t refresh.
          </div>
        </div>
      )}
    </form>
  );
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
