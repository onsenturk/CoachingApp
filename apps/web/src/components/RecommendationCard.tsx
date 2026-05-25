"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import type {
  RecommendationDurationBucket,
  RecommendationEffort,
  RecommendationSport,
  WorkoutRecommendation,
} from "@coaching/training/dailyRecommendation";

const DURATION_OPTIONS: Array<{
  value: RecommendationDurationBucket;
  label: string;
}> = [
  { value: "under20", label: "<20 min" },
  { value: "20to40", label: "20-40 min" },
  { value: "over40", label: "40+ min" },
];

const EFFORT_OPTIONS: Array<{ value: RecommendationEffort; label: string }> = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "hard", label: "Hard" },
];

const SPORT_OPTIONS: Array<{ value: RecommendationSport; label: string }> = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
];

type LoadState = "idle" | "loading" | "ready" | "error";

export function RecommendationCard({
  initialSport = "run",
}: {
  initialSport?: RecommendationSport;
}) {
  const [sport, setSport] = useState<RecommendationSport>(initialSport);
  const [durationBucket, setDurationBucket] =
    useState<RecommendationDurationBucket>("20to40");
  const [effort, setEffort] = useState<RecommendationEffort>("moderate");
  const [recommendation, setRecommendation] =
    useState<WorkoutRecommendation | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [refreshToken, setRefreshToken] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ sport, durationBucket, effort });
    return params.toString();
  }, [durationBucket, effort, sport]);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/recommendation/today?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("recommendation failed");
        return (await response.json()) as {
          recommendation: WorkoutRecommendation;
        };
      })
      .then((payload) => {
        setRecommendation(payload.recommendation);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState("error");
      });

    return () => controller.abort();
  }, [query, refreshToken]);

  function refresh() {
    setRefreshToken((value) => value + 1);
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-500">
            Daily recommendation
          </h2>
          {recommendation ? (
            <p className="mt-1 text-xs text-neutral-500">
              Confidence {Math.round(recommendation.confidence * 100)}% ·{" "}
              {recommendation.planContext === "planned-session"
                ? "uses today's plan"
                : "ad-hoc"}
            </p>
          ) : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={state === "loading"}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SegmentedControl
          label="Duration"
          value={durationBucket}
          options={DURATION_OPTIONS}
          onChange={setDurationBucket}
        />
        <SegmentedControl
          label="Effort"
          value={effort}
          options={EFFORT_OPTIONS}
          onChange={setEffort}
        />
        <SegmentedControl
          label="Sport"
          value={sport}
          options={SPORT_OPTIONS}
          onChange={setSport}
        />
      </div>

      <div className="mt-4 min-h-28 rounded-md border border-neutral-100 bg-neutral-50 p-3">
        {state === "error" ? (
          <p className="text-sm text-rose-700">
            Could not load a recommendation right now.
          </p>
        ) : recommendation ? (
          <RecommendationSummary recommendation={recommendation} />
        ) : (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 rounded bg-neutral-200" />
            <div className="h-3 w-full max-w-md rounded bg-neutral-200" />
            <div className="h-3 w-2/3 rounded bg-neutral-200" />
          </div>
        )}
      </div>
    </section>
  );
}

function SegmentedControl<TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: Array<{ value: TValue; label: string }>;
  onChange: (value: TValue) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div
        role="group"
        aria-label={label}
        className={`grid min-h-9 rounded-md border border-neutral-200 bg-neutral-100 p-0.5 ${
          options.length === 2 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={`min-w-0 rounded px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                active
                  ? "bg-white text-neutral-950 shadow-sm"
                  : "text-neutral-600 hover:bg-white/70"
              }`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecommendationSummary({
  recommendation,
}: {
  recommendation: WorkoutRecommendation;
}) {
  const tone = recommendation.safetyDowngraded
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : recommendation.workoutType === "rest" ||
        recommendation.workoutType === "recovery"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold capitalize text-neutral-950">
          {recommendation.workoutType.replaceAll("-", " ")}
        </span>
        <Chip>{recommendation.sport}</Chip>
        <Chip>{recommendation.effort}</Chip>
        <Chip>
          {recommendation.durationMin > 0
            ? `${recommendation.durationMin} min`
            : "rest"}
        </Chip>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        {recommendation.description}
      </p>
      {recommendation.safetyDowngraded ? (
        <div className={`mt-3 rounded border px-3 py-2 text-xs ${tone}`}>
          Adjusted from the selected options based on recent training or
          readiness.
        </div>
      ) : null}
      <ul className="mt-3 space-y-1 text-xs text-neutral-500">
        {recommendation.reasons.slice(0, 2).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-700 ring-1 ring-neutral-200">
      {children}
    </span>
  );
}
