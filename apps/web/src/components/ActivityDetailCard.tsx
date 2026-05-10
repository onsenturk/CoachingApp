import {
  estimateCalories,
  formatDistance,
  formatDuration,
  formatRelativeTime,
  sportLabel,
} from "@/app/activities/activityFormat";
import { SportBadge } from "@/app/activities/visuals";
import {
  activityPaceSecPerKm,
  activitySpeedKmh,
  formatPace,
  formatSpeed,
  isRideSport,
  isRunSport,
} from "@/lib/activityMetrics";
import {
  PlannedSessionCard,
  type PlannedSessionCardSession,
} from "@/components/PlannedSessionCard";

export type ActivityDetailCardActivity = {
  id: bigint;
  sportType: string;
  name: string;
  startDateLocal: Date;
  movingTime: number;
  distance: number;
  averageHr: number | null;
  maxHr?: number | null;
  averageWatts: number | null;
  weightedAvgWatts: number | null;
  averageSpeed: number | null;
  averageCadence: number | null;
  kilojoules: number | null;
  tss: number | null;
  trimp: number | null;
  rawJson: unknown;
  createdAt: Date;
  summary?: { text: string } | null;
};

export function ActivityDetailCard({
  activity,
  weightKg,
  plannedSession,
  compact = false,
}: {
  activity: ActivityDetailCardActivity;
  weightKg: number;
  plannedSession?: PlannedSessionCardSession | null;
  compact?: boolean;
}) {
  const run = isRunSport(activity.sportType);
  const ride = isRideSport(activity.sportType);
  const kcal = estimateCalories(activity, weightKg);
  const primaryMetric = run
    ? { label: "Avg pace", value: formatPace(activityPaceSecPerKm(activity)) }
    : { label: "Avg speed", value: formatSpeed(activitySpeedKmh(activity)) };

  return (
    <article className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SportBadge sportType={activity.sportType} />
            <span className="text-xs text-neutral-500">
              {activity.startDateLocal.toISOString().slice(0, 10)}
            </span>
            <span
              className="text-[10px] text-neutral-400"
              title={activity.createdAt.toISOString()}
            >
              synced {formatRelativeTime(activity.createdAt)}
            </span>
          </div>
          <h3 className="mt-2 truncate text-base font-semibold text-neutral-900">
            {activity.name}
          </h3>
          <p className="text-xs text-neutral-500">
            {sportLabel(activity.sportType)}
          </p>
        </div>
        <div className="rounded bg-neutral-50 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
            {primaryMetric.label}
          </div>
          <div className="font-mono text-lg font-semibold text-neutral-900">
            {primaryMetric.value}
          </div>
        </div>
      </div>

      <dl
        className={`mt-4 grid gap-2 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}
      >
        <Metric label="Distance" value={formatDistance(activity.distance)} />
        <Metric
          label="Moving time"
          value={formatDuration(activity.movingTime)}
        />
        {activity.averageHr ? (
          <Metric
            label="Avg HR"
            value={`${Math.round(activity.averageHr)} bpm`}
          />
        ) : null}
        <Metric label="Calories" value={`${kcal.toLocaleString()} kcal`} />
        {ride && activity.averageWatts ? (
          <Metric
            label="Avg power"
            value={`${Math.round(activity.averageWatts)} W`}
          />
        ) : null}
        {ride && activity.weightedAvgWatts ? (
          <Metric label="Weighted" value={`${activity.weightedAvgWatts} W`} />
        ) : null}
        {activity.averageCadence ? (
          <Metric
            label="Cadence"
            value={`${Math.round(activity.averageCadence)} rpm`}
          />
        ) : null}
        {activity.tss !== null ? (
          <Metric label="TSS" value={`${Math.round(activity.tss)}`} />
        ) : activity.trimp !== null ? (
          <Metric label="TRIMP" value={`${Math.round(activity.trimp)}`} />
        ) : null}
      </dl>

      {activity.summary?.text ? (
        <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Coach summary
          </div>
          <p>{activity.summary.text}</p>
        </div>
      ) : null}

      {plannedSession ? (
        <details className="mt-4 rounded-md border border-neutral-200 bg-neutral-50">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500">
            Matched planned workout
          </summary>
          <div className="border-t border-neutral-200 p-3">
            <PlannedSessionCard session={plannedSession} compact />
          </div>
        </details>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-neutral-50 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
