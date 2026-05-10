import type { ReactNode } from "react";
import { sportLabel } from "@/app/activities/activityFormat";

type SessionStructure = {
  targetPaceSecPerKm?: number;
  targetPowerW?: number;
  warmupMin?: number;
  cooldownMin?: number;
  intervals?: Array<{
    reps?: number;
    durationSec?: number;
    distanceM?: number;
    recoverySec?: number;
    targetZone?: string;
    targetPaceSecPerKm?: number;
    targetPowerW?: number;
  }>;
};

export type PlannedSessionCardSession = {
  id: string;
  date: Date;
  weekIndex: number;
  dayOfWeek: number;
  sport: string;
  workoutType: string;
  durationMin: number | null;
  distanceM: number | null;
  description: string;
  structureJson: unknown;
  isHard: boolean;
  status: string;
};

const STATUS_CHIP: Record<string, string> = {
  planned: "bg-neutral-100 text-neutral-700",
  done: "bg-emerald-100 text-emerald-800",
  skipped: "bg-neutral-200 text-neutral-600 line-through",
  adjusted: "bg-amber-100 text-amber-800",
};

export function PlannedSessionCard({
  session,
  actions,
  defaultOpen = false,
  compact = false,
}: {
  session: PlannedSessionCardSession;
  actions?: ReactNode;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const structure = parseStructure(session.structureJson);
  const targetPace = fmtPace(structure.targetPaceSecPerKm);
  const targetPower = fmtPower(structure.targetPowerW);
  const hasStructure =
    targetPace != null ||
    targetPower != null ||
    structure.warmupMin != null ||
    structure.cooldownMin != null ||
    (structure.intervals?.length ?? 0) > 0;

  return (
    <article
      className={`rounded-md border border-neutral-200 bg-white ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold capitalize text-neutral-900">
              {session.workoutType.replaceAll("-", " ")}
            </span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-700">
              {sportLabel(session.sport)}
            </span>
            {session.isHard && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                hard
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                STATUS_CHIP[session.status] ?? "bg-neutral-100 text-neutral-700"
              }`}
            >
              {session.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">{session.description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
        <Detail label="Week" value={`${session.weekIndex}`} />
        <Detail label="Day" value={dayName(session.dayOfWeek)} />
        {session.durationMin ? (
          <Detail label="Duration" value={`${session.durationMin} min`} />
        ) : null}
        {session.distanceM ? (
          <Detail
            label="Distance"
            value={`${(session.distanceM / 1000).toFixed(1)} km`}
          />
        ) : null}
        {targetPace ? <Detail label="Target pace" value={targetPace} /> : null}
        {targetPower ? (
          <Detail label="Target power" value={targetPower} />
        ) : null}
      </dl>

      <details
        className="mt-3 rounded-md border border-neutral-200 bg-neutral-50"
        open={defaultOpen}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500">
          Workout details
        </summary>
        <div className="border-t border-neutral-200 px-3 py-3 text-xs text-neutral-700">
          {hasStructure ? (
            <ul className="space-y-1.5">
              {structure.warmupMin != null && structure.warmupMin > 0 && (
                <li>Warm-up: {structure.warmupMin} min easy</li>
              )}
              {structure.intervals?.map((interval, index) => (
                <li key={index}>
                  Main set: {interval.reps ?? 1} x {fmtIntervalWork(interval)}
                  {interval.targetZone
                    ? ` @ ${interval.targetZone.toUpperCase()}`
                    : ""}
                  {interval.targetPaceSecPerKm
                    ? ` (${fmtPace(interval.targetPaceSecPerKm)})`
                    : ""}
                  {interval.targetPowerW
                    ? ` (${fmtPower(interval.targetPowerW)})`
                    : ""}
                  {interval.recoverySec
                    ? `, ${fmtSeconds(interval.recoverySec)} recovery`
                    : ""}
                </li>
              ))}
              {targetPace && !structure.intervals?.length ? (
                <li>Steady target: {targetPace}</li>
              ) : null}
              {targetPower && !structure.intervals?.length ? (
                <li>Steady power: {targetPower}</li>
              ) : null}
              {structure.cooldownMin != null && structure.cooldownMin > 0 && (
                <li>Cool-down: {structure.cooldownMin} min easy</li>
              )}
            </ul>
          ) : (
            <p className="text-neutral-500">
              No interval structure stored for this session yet.
            </p>
          )}
        </div>
      </details>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="font-medium text-neutral-800">{value}</dd>
    </div>
  );
}

export function parseStructure(value: unknown): SessionStructure {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SessionStructure;
}

function fmtPace(secPerKm: unknown): string | null {
  if (
    typeof secPerKm !== "number" ||
    !Number.isFinite(secPerKm) ||
    secPerKm <= 0
  )
    return null;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  const kmh = 3600 / secPerKm;
  return `${min}:${String(sec).padStart(2, "0")}/km · ${kmh.toFixed(1)} km/h`;
}

function fmtPower(watts: unknown): string | null {
  if (typeof watts !== "number" || !Number.isFinite(watts) || watts <= 0)
    return null;
  return `${Math.round(watts)} W`;
}

function fmtIntervalWork(
  interval: NonNullable<SessionStructure["intervals"]>[number],
): string {
  if (
    typeof interval.distanceM === "number" &&
    Number.isFinite(interval.distanceM) &&
    interval.distanceM > 0
  ) {
    return interval.distanceM >= 1000
      ? `${(interval.distanceM / 1000).toFixed(1)} km`
      : `${Math.round(interval.distanceM)} m`;
  }
  return fmtSeconds(interval.durationSec);
}

function fmtSeconds(seconds: unknown): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return "time";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  if (min > 0 && sec > 0) return `${min}m ${sec}s`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

function dayName(dayOfWeek: number): string {
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayOfWeek - 1] ??
    `${dayOfWeek}`
  );
}
