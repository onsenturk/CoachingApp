"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";

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

// Suppress unused warning — kept for future text-paste support.
void parseHmsToSec;

/**
 * Per-distance quick-pick finish times (seconds). Spans rec → competitive.
 * Used to populate the chip row + bound the slider.
 */
const QUICK_TIMES_SEC: Record<string, number[]> = {
  "5k": [20 * 60, 23 * 60, 25 * 60, 28 * 60, 30 * 60, 35 * 60, 40 * 60],
  "10k": [50 * 60, 55 * 60, 60 * 60, 70 * 60, 80 * 60],
  half: [90 * 60, 105 * 60, 120 * 60, 135 * 60, 150 * 60],
  marathon: [3 * 3600 + 30 * 60, 4 * 3600, 4 * 3600 + 30 * 60, 5 * 3600, 5 * 3600 + 30 * 60],
  custom: [30 * 60, 45 * 60, 60 * 60, 90 * 60, 120 * 60],
};

function fmtTimeShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}min`;
}

export function GoalForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [goalType, setGoalType] = useState<PresetId>("half");
  const [customKm, setCustomKm] = useState("10");
  const [targetTimeSec, setTargetTimeSec] = useState<number | null>(null);
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
    const targetTimeSecPayload = targetTimeSec ?? undefined;

    const payload = {
      goalType,
      distanceM,
      targetTimeSec: targetTimeSecPayload,
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
        <div role="radiogroup" aria-label="Race distance" className="flex flex-wrap gap-2">
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
        <div className="mb-2 flex items-baseline justify-between">
          <legend className="text-sm font-medium text-neutral-700">
            Target finish time <span className="font-normal text-neutral-400">(optional)</span>
          </legend>
          {targetTimeSec != null && (
            <button
              type="button"
              onClick={() => setTargetTimeSec(null)}
              className="text-xs text-neutral-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1"
            >
              Clear
            </button>
          )}
        </div>
        <TargetTimePicker
          goalType={goalType}
          valueSec={targetTimeSec}
          onChange={setTargetTimeSec}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Leave blank to just complete the distance.
        </p>
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
            onChange={(e) => onWeeksChange(Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          />
          <span className="mt-1 block text-xs text-neutral-500">4–16 (rec. 8)</span>
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
          <span className="mt-1 block text-xs text-neutral-500">3–7 (rec. 4)</span>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">
            Race day <span className="font-normal text-neutral-400">(optional)</span>
          </span>
          <input
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Auto-set from weeks; override if you have a fixed race date.
          </span>
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

      <Button type="submit" variant="primary" size="md" loading={pending}>
        {pending ? "Generating plan" : "Generate plan"}
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

/**
 * Tap-friendly target-time picker.
 * - Quick-pick chips per distance (most users tap & go).
 * - H/M steppers for fine adjustment (no keyboard parsing).
 * - Live "pace per km" feedback so the user understands what they're asking for.
 */
function TargetTimePicker({
  goalType,
  valueSec,
  onChange,
}: {
  goalType: PresetId;
  valueSec: number | null;
  onChange: (sec: number) => void;
}) {
  const chips = QUICK_TIMES_SEC[goalType] ?? QUICK_TIMES_SEC.custom!;
  const distanceKm =
    goalType === "custom"
      ? null
      : (PRESETS.find((p) => p.id === goalType)?.distanceM ?? 0) / 1000;

  const totalSec = valueSec ?? 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  function setHMS(newH: number, newM: number, newS: number) {
    const hh = Math.max(0, Math.min(8, newH));
    const mm = Math.max(0, Math.min(59, newM));
    const ss = Math.max(0, Math.min(59, newS));
    const sec = hh * 3600 + mm * 60 + ss;
    if (sec > 0) onChange(sec);
  }

  return (
    <div className="space-y-3">
      {/* Quick-pick chips */}
      <div role="radiogroup" aria-label="Quick finish times" className="flex flex-wrap gap-2">
        {chips.map((sec) => {
          const active = valueSec === sec;
          return (
            <button
              key={sec}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(sec)}
              className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1 ${
                active
                  ? "border-orange-600 bg-orange-600 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-orange-400 hover:bg-orange-50"
              }`}
            >
              {fmtTimeShort(sec)}
            </button>
          );
        })}
      </div>

      {/* Fine-tune steppers */}
      <div className="flex flex-wrap items-end gap-3">
        <Stepper label="Hours" value={h} min={0} max={8} onChange={(v) => setHMS(v, m, s)} />
        <Stepper label="Minutes" value={m} min={0} max={59} onChange={(v) => setHMS(h, v, s)} />
        <Stepper label="Seconds" value={s} min={0} max={59} step={5} onChange={(v) => setHMS(h, m, v)} />
        {valueSec != null && distanceKm != null && distanceKm > 0 && (
          <div className="ml-auto rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            <div>
              Pace:{" "}
              <span className="font-mono font-semibold text-neutral-900">
                {fmtPace(valueSec / distanceKm)}/km
              </span>
            </div>
            <div className="mt-0.5 text-neutral-500">
              Total: <span className="font-mono">{fmtTime(valueSec)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="inline-flex items-stretch overflow-hidden rounded-md border border-neutral-300">
        <button
          type="button"
          onClick={dec}
          aria-label={`Decrease ${label}`}
          className="h-10 w-10 text-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="w-12 border-x border-neutral-300 text-center font-mono text-base focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500"
          aria-label={label}
        />
        <button
          type="button"
          onClick={inc}
          aria-label={`Increase ${label}`}
          className="h-10 w-10 text-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
        >
          +
        </button>
      </div>
    </div>
  );
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
