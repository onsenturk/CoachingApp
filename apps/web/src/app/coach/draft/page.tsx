import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@coaching/db";
import { AppNavTabs } from "@/components/AppNavTabs";
import { PlannedSessionCard } from "@/components/PlannedSessionCard";
import { DraftPlanActions } from "./DraftPlanActions";

type DraftSearchParams = Promise<{ id?: string }>;

type RuleViolation = {
  code?: string;
  weekIndex?: number;
  message?: string;
};

type DraftMeta = {
  programIntensity?: string;
  paceStrategy?: string;
  ruleValidation?: {
    ok?: boolean;
    violations?: RuleViolation[];
  };
  safetyRetry?: {
    applied?: boolean;
    message?: string;
    violations?: RuleViolation[];
  };
};

const FEASIBILITY_CHIP: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
};

export default async function DraftPlanPage({
  searchParams,
}: {
  searchParams: DraftSearchParams;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { id } = await searchParams;
  const [draft, activeProgram] = await Promise.all([
    prisma.program.findFirst({
      where: id ? { id, userId, status: "draft" } : { userId, status: "draft" },
      orderBy: { createdAt: "desc" },
      include: { plannedSessions: { orderBy: { date: "asc" } } },
    }),
    prisma.program.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true, goalType: true, weeksTotal: true, createdAt: true },
    }),
  ]);

  if (!draft) redirect("/coach");

  const meta = parseDraftMeta(draft.metaJson);
  const ruleViolations = meta.ruleValidation?.violations ?? [];
  const safetyRetryViolations = meta.safetyRetry?.violations ?? [];
  const warningMessages = [
    ...(meta.safetyRetry?.applied && meta.safetyRetry.message
      ? [meta.safetyRetry.message]
      : []),
    ...ruleViolations.map(
      (violation) => violation.message ?? violation.code ?? "Rule warning",
    ),
  ];
  const sessionsByWeek = new Map<number, typeof draft.plannedSessions>();
  for (const plannedSession of draft.plannedSessions) {
    const weekSessions = sessionsByWeek.get(plannedSession.weekIndex) ?? [];
    weekSessions.push(plannedSession);
    sessionsByWeek.set(plannedSession.weekIndex, weekSessions);
  }

  const totalDistanceM = draft.plannedSessions.reduce(
    (sum, plannedSession) => sum + (plannedSession.distanceM ?? 0),
    0,
  );
  const chipClass =
    FEASIBILITY_CHIP[draft.feasibility] ?? "bg-neutral-100 text-neutral-700";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 space-y-4">
        <div className="space-y-2">
          <Link href="/coach" className="text-sm text-neutral-600 underline">
            Back to Coach
          </Link>
          <h1 className="text-2xl font-semibold">Review draft plan</h1>
        </div>
        <AppNavTabs />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4 lg:order-1">
          {warningMessages.length > 0 && (
            <section
              role="alert"
              className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <div className="font-medium">This draft has safety warnings.</div>
              <p className="mt-1">
                You can still accept this plan, but review these warnings before
                activating it.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {warningMessages.slice(0, 6).map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
              {warningMessages.length > 6 && (
                <p className="mt-2 text-xs">
                  {warningMessages.length - 6} more warnings.
                </p>
              )}
            </section>
          )}

          {[...sessionsByWeek.entries()].map(([weekIndex, weekSessions]) => {
            const weekDistanceM = weekSessions.reduce(
              (sum, plannedSession) => sum + (plannedSession.distanceM ?? 0),
              0,
            );
            const hardSessions = weekSessions.filter(
              (plannedSession) => plannedSession.isHard,
            ).length;
            const weekWarnings = [
              ...ruleViolations,
              ...safetyRetryViolations,
            ].filter((violation) => violation.weekIndex === weekIndex);

            return (
              <details
                key={weekIndex}
                open={weekIndex === 1}
                className="rounded border border-neutral-200 bg-white"
              >
                <summary className="cursor-pointer select-none px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500">
                  <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-neutral-900">
                      Week {weekIndex}
                    </span>
                    <span className="text-neutral-500">
                      {weekSessions.length} sessions ·{" "}
                      {(weekDistanceM / 1000).toFixed(1)} km · {hardSessions}{" "}
                      hard
                    </span>
                  </span>
                  {weekWarnings.length > 0 && (
                    <span className="mt-2 inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      {weekWarnings.length} warning
                      {weekWarnings.length === 1 ? "" : "s"}
                    </span>
                  )}
                </summary>
                {weekWarnings.length > 0 && (
                  <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                    <ul className="list-disc space-y-1 pl-4">
                      {weekWarnings.map((violation, index) => (
                        <li key={`${violation.code ?? "warning"}-${index}`}>
                          {violation.message ??
                            violation.code ??
                            "Rule warning"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="space-y-3 border-t border-neutral-200 p-3">
                  {weekSessions.map((plannedSession) => (
                    <PlannedSessionCard
                      key={plannedSession.id}
                      session={plannedSession}
                      compact
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:order-2">
          <section className="rounded border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">
                {formatGoalLabel(draft.goalType)}
              </h2>
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${chipClass}`}
              >
                {draft.feasibility}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field
                label="Approach"
                value={formatIntensity(meta.programIntensity)}
              />
              <Field label="Weeks" value={String(draft.weeksTotal)} />
              <Field
                label="Sessions / wk"
                value={String(draft.sessionsPerWk)}
              />
              <Field
                label="Total sessions"
                value={String(draft.plannedSessions.length)}
              />
              <Field
                label="Total volume"
                value={`${(totalDistanceM / 1000).toFixed(1)} km`}
              />
              <Field
                label="Race day"
                value={
                  draft.goalDate ? draft.goalDate.toLocaleDateString() : "-"
                }
              />
              <Field
                label="Plan target"
                value={
                  draft.goalTargetSec ? formatHms(draft.goalTargetSec) : "-"
                }
              />
            </dl>
            {draft.feasibilityReason && (
              <p className="mt-3 text-xs text-neutral-600">
                {draft.feasibilityReason}
              </p>
            )}
            {meta.paceStrategy && (
              <p className="mt-3 text-xs text-neutral-600">
                {meta.paceStrategy}
              </p>
            )}
          </section>

          <section className="rounded border border-neutral-200 bg-white p-4">
            <h2 className="text-base font-medium">Activate draft</h2>
            <p className="mt-1 mb-4 text-sm text-neutral-600">
              {activeProgram
                ? "Accepting archives your current active plan and makes this draft drive the calendar."
                : "Accepting makes this draft your active calendar plan."}
            </p>
            <DraftPlanActions draftId={draft.id} />
          </section>
        </aside>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-base font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

function parseDraftMeta(metaJson: unknown): DraftMeta {
  if (!isRecord(metaJson)) return {};
  const ruleValidation = isRecord(metaJson.ruleValidation)
    ? {
        ok:
          typeof metaJson.ruleValidation.ok === "boolean"
            ? metaJson.ruleValidation.ok
            : undefined,
        violations: parseViolations(metaJson.ruleValidation.violations),
      }
    : undefined;
  const safetyRetry = isRecord(metaJson.safetyRetry)
    ? {
        applied: metaJson.safetyRetry.applied === true,
        message:
          typeof metaJson.safetyRetry.message === "string"
            ? metaJson.safetyRetry.message
            : undefined,
        violations: parseViolations(metaJson.safetyRetry.violations),
      }
    : undefined;

  return {
    programIntensity:
      typeof metaJson.programIntensity === "string"
        ? metaJson.programIntensity
        : undefined,
    paceStrategy:
      typeof metaJson.paceStrategy === "string"
        ? metaJson.paceStrategy
        : undefined,
    ruleValidation,
    safetyRetry,
  };
}

function parseViolations(value: unknown): RuleViolation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((violation) => ({
    code: typeof violation.code === "string" ? violation.code : undefined,
    weekIndex:
      typeof violation.weekIndex === "number" ? violation.weekIndex : undefined,
    message:
      typeof violation.message === "string" ? violation.message : undefined,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatGoalLabel(goalType: string): string {
  const presetLabels: Record<string, string> = {
    "5k": "5K",
    "10k": "10K",
    half: "Half marathon",
    marathon: "Marathon",
    custom: "Custom race",
  };
  return presetLabels[goalType] ?? goalType;
}

function formatIntensity(programIntensity: string | undefined): string {
  const labels: Record<string, string> = {
    easy: "Easy",
    moderate: "Moderate",
    aggressive: "Aggressive",
  };
  return programIntensity
    ? (labels[programIntensity] ?? programIntensity)
    : "Moderate";
}

function formatHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
