"use client";

import { useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

const PROGRESS_STEPS = [
  "Analyzing your baseline fitness...",
  "Calling the AI coach...",
  "Applying your pacing approach...",
  "Scheduling key sessions and recovery days...",
  "Checking the draft against safety rules...",
] as const;

const PRESETS = [
  { id: "5k", label: "5K", distanceM: 5_000 },
  { id: "10k", label: "10K", distanceM: 10_000 },
  { id: "half", label: "Half marathon", distanceM: 21_097.5 },
  { id: "marathon", label: "Marathon", distanceM: 42_195 },
  { id: "custom", label: "Custom", distanceM: 0 },
] as const;

const PROGRAM_INTENSITIES = [
  { id: "easy", label: "Easy", detail: "Conservative paces" },
  { id: "moderate", label: "Moderate", detail: "Balanced progression" },
  { id: "aggressive", label: "Aggressive", detail: "Ambitious paces" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];
type ProgramIntensity = (typeof PROGRAM_INTENSITIES)[number]["id"];

export function GoalForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [goalType, setGoalType] = useState<PresetId>("half");
  const [customKm, setCustomKm] = useState("10");
  const [programIntensity, setProgramIntensity] =
    useState<ProgramIntensity>("moderate");
  const [weeksTotal, setWeeksTotal] = useState(6);
  const [sessionsPerWk, setSessionsPerWk] = useState(4);
  const [goalDate, setGoalDate] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const distanceM =
      goalType === "custom"
        ? Number(customKm) * 1000
        : PRESETS.find((p) => p.id === goalType)!.distanceM;
    if (!distanceM || distanceM <= 0) {
      setError("Pick a distance.");
      return;
    }
    if (weeksTotal < 4 || weeksTotal > 16) {
      setError("Weeks of training must be between 4 and 16.");
      return;
    }
    if (sessionsPerWk < 3 || sessionsPerWk > 7) {
      setError("Sessions per week must be between 3 and 7.");
      return;
    }

    const payload = {
      goalType,
      distanceM,
      goalDate: goalDate || undefined,
      weeksTotal,
      sessionsPerWk,
      programIntensity,
      sport: "run" as const,
    };

    startTransition(async () => {
      const res = await fetch("/api/program/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.draftProgramId) {
        router.push(
          `/coach/draft?id=${encodeURIComponent(json.draftProgramId)}` as Route,
        );
        router.refresh();
        return;
      }

      if (Array.isArray(json?.violations) && json.violations.length > 0) {
        const lines = json.violations
          .slice(0, 5)
          .map(
            (v: { message?: string; code?: string }) =>
              `- ${v.message ?? v.code}`,
          )
          .join("\n");
        setError(`${json.error ?? "Plan could not be created"}:\n${lines}`);
        return;
      }

      setError(json?.error ?? `Request failed (${res.status}).`);
    });
  }

  return (
    <form className="relative space-y-5" onSubmit={onSubmit}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">
          Race distance
        </legend>
        <div
          role="radiogroup"
          aria-label="Race distance"
          className="flex flex-wrap gap-2"
        >
          {PRESETS.map((p) => {
            const active = goalType === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGoalType(p.id)}
                className={`min-h-[36px] rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 ${
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {p.label}
              </button>
            );
          })}
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

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-neutral-700">
          Program approach
        </legend>
        <div
          role="radiogroup"
          aria-label="Program approach"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {PROGRAM_INTENSITIES.map((option) => {
            const active = programIntensity === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setProgramIntensity(option.id)}
                className={`min-h-[58px] rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 ${
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white hover:border-neutral-500 hover:bg-neutral-50"
                }`}
              >
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span
                  className={`block text-xs ${active ? "text-neutral-200" : "text-neutral-500"}`}
                >
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-neutral-700">Weeks of training</span>
          <input
            type="number"
            inputMode="numeric"
            min={4}
            max={16}
            step={1}
            value={weeksTotal}
            onChange={(e) => setWeeksTotal(Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          />
          <span className="mt-1 block text-xs text-neutral-500">4-16</span>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Sessions / week</span>
          <input
            type="number"
            inputMode="numeric"
            min={3}
            max={7}
            step={1}
            value={sessionsPerWk}
            onChange={(e) => setSessionsPerWk(Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          />
          <span className="mt-1 block text-xs text-neutral-500">3-7</span>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">
            Race day{" "}
            <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Defaults to the end of the plan
          </span>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="whitespace-pre-line rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      <Button type="submit" variant="primary" size="md" loading={pending}>
        {pending ? "Generating draft" : "Generate draft plan"}
      </Button>

      {pending && (
        <div
          aria-live="polite"
          aria-busy="true"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/85 backdrop-blur-sm"
        >
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900"
            role="status"
            aria-label="Generating draft plan"
          />
          <div className="text-sm font-medium text-neutral-900">
            AI coach is drafting your program
          </div>
          <div className="text-xs text-neutral-600">
            {PROGRESS_STEPS[progressIdx]}
          </div>
          <div className="text-[11px] text-neutral-500">
            This usually takes 15-30 seconds. Please don't refresh.
          </div>
        </div>
      )}
    </form>
  );
}
