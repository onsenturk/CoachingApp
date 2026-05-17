import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { sportLabel } from "../activities/activityFormat";
import { AppNavTabs } from "@/components/AppNavTabs";
import { PlannedSessionCard } from "@/components/PlannedSessionCard";

const DAYS_AHEAD = 14;
const DAYS_BACK = 7;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const FEASIBILITY_CHIP: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
};

type CalendarSearchParams = Promise<{ view?: string; warning?: string }>;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: CalendarSearchParams;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { view, warning } = await searchParams;
  const showFullPlan = view === "plan";

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - DAYS_BACK);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + DAYS_AHEAD);

  const activeProgram = await prisma.program.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  const planned = activeProgram
    ? await prisma.plannedSession.findMany({
        where: showFullPlan
          ? { programId: activeProgram.id }
          : {
              programId: activeProgram.id,
              date: { gte: start, lte: end },
            },
        orderBy: { date: "asc" },
      })
    : [];
  const activities = await prisma.activity.findMany({
    where: {
      userId,
      startDateLocal: { gte: start, lte: end },
    },
    orderBy: { startDateLocal: "asc" },
  });
  const programWarnings = getProgramWarnings(activeProgram?.metaJson);
  const showSafetyRetryWarning = warning === "safety-retry";

  const byDay = new Map<
    string,
    { planned: typeof planned; activities: typeof activities }
  >();
  if (showFullPlan && planned.length > 0) {
    const first = new Date(planned[0]!.date);
    const last = new Date(planned[planned.length - 1]!.date);
    for (
      const d = new Date(first);
      d <= last;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      byDay.set(dayKey(d), { planned: [], activities: [] });
    }
  } else {
    for (let i = -DAYS_BACK; i <= DAYS_AHEAD; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      byDay.set(dayKey(d), { planned: [], activities: [] });
    }
  }
  for (const p of planned) byDay.get(dayKey(p.date))?.planned.push(p);
  for (const a of activities)
    byDay.get(dayKey(a.startDateLocal))?.activities.push(a);

  const todayKey = dayKey(today);

  // Program header info.
  let programHeader: React.ReactNode = null;
  if (activeProgram) {
    const goalLabels: Record<string, string> = {
      "5k": "5K",
      "10k": "10K",
      half: "Half marathon",
      marathon: "Marathon",
      custom: "Custom race",
    };
    const goalLabel =
      goalLabels[activeProgram.goalType] ?? activeProgram.goalType;
    const elapsedDays = Math.floor(
      (today.getTime() - activeProgram.createdAt.getTime()) / 86_400_000,
    );
    const currentWeek = Math.min(
      activeProgram.weeksTotal,
      Math.max(1, Math.floor(elapsedDays / 7) + 1),
    );
    const chipClass =
      FEASIBILITY_CHIP[activeProgram.feasibility] ??
      "bg-neutral-100 text-neutral-700";
    programHeader = (
      <section className="mb-5 rounded border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-base font-medium">
              {goalLabel}
              {activeProgram.goalTargetSec
                ? ` · target ${fmtHms(activeProgram.goalTargetSec)}`
                : ""}
            </div>
            <div className="text-xs text-neutral-500">
              {activeProgram.goalDate
                ? `Race ${activeProgram.goalDate.toLocaleDateString()} · `
                : ""}
              Week {currentWeek} / {activeProgram.weeksTotal} ·{" "}
              {activeProgram.sessionsPerWk} sessions/wk
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${chipClass}`}
            >
              {activeProgram.feasibility}
            </span>
            <Link href="/coach" className="text-xs underline">
              Replace plan
            </Link>
          </div>
        </div>
      </section>
    );
  } else {
    programHeader = (
      <section className="mb-5 rounded border border-dashed border-neutral-300 p-4 text-sm">
        <div className="font-medium">No active program.</div>
        <p className="mt-1 text-neutral-600">
          <Link href="/coach" className="underline">
            Generate a training plan →
          </Link>
        </p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-4">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <AppNavTabs />
      </header>
      {programHeader}
      {(showSafetyRetryWarning || programWarnings.length > 0) && (
        <section className="mb-5 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-medium">Safety review notice.</div>
          {programWarnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {programWarnings.slice(0, 6).map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">
              The first generated plan violated physiological guardrails, so the
              AI coach ran a second pass. Review the workouts before following
              them.
            </p>
          )}
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-neutral-200 bg-white p-1 text-sm">
          <Link
            href="/calendar"
            className={`rounded px-3 py-1.5 font-medium ${
              !showFullPlan
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Window
          </Link>
          <Link
            href="/calendar?view=plan"
            className={`rounded px-3 py-1.5 font-medium ${
              showFullPlan
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Full plan
          </Link>
        </div>
        <p className="text-sm text-neutral-500">
          {showFullPlan
            ? "Every day in the active plan. Open a workout to see its structure."
            : `Past ${DAYS_BACK} days and next ${DAYS_AHEAD} days. Activities come from Strava.`}
        </p>
      </div>
      <ol className="divide-y rounded border border-neutral-200">
        {[...byDay.entries()].map(([k, { planned: ps, activities: acts }]) => {
          const isToday = k === todayKey;
          const empty = ps.length === 0 && acts.length === 0;
          return (
            <li
              key={k}
              className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start ${
                isToday ? "bg-amber-50" : ""
              }`}
            >
              <div className="w-28 shrink-0">
                <div className="font-mono text-xs text-neutral-500">{k}</div>
                {isToday && (
                  <div className="text-xs font-semibold text-amber-700">
                    today
                  </div>
                )}
              </div>
              <div className="grow">
                {empty && (
                  <div className="text-xs text-neutral-400">— rest —</div>
                )}
                {ps.map((p) => (
                  <PlannedSessionCard key={p.id} session={p} compact />
                ))}
                {acts.map((a) => (
                  <div
                    key={a.id.toString()}
                    className="text-sm text-neutral-700"
                  >
                    <span className="text-emerald-700">✓</span>{" "}
                    <span className="font-medium">
                      {sportLabel(a.sportType)}
                    </span>{" "}
                    · {(a.distance / 1000).toFixed(1)}km ·{" "}
                    {Math.round(a.movingTime / 60)}min
                    {a.tss !== null ? (
                      <span className="text-neutral-500">
                        {" "}
                        · TSS {Math.round(a.tss)}
                      </span>
                    ) : a.trimp !== null ? (
                      <span className="text-neutral-500">
                        {" "}
                        · TRIMP {Math.round(a.trimp)}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function getProgramWarnings(metaJson: unknown): string[] {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson))
    return [];
  const warnings: string[] = [];
  const safetyRetry = (metaJson as { safetyRetry?: unknown }).safetyRetry;
  if (
    safetyRetry &&
    typeof safetyRetry === "object" &&
    !Array.isArray(safetyRetry)
  ) {
    const typedSafetyRetry = safetyRetry as {
      applied?: unknown;
      message?: unknown;
    };
    if (typedSafetyRetry.applied === true) {
      warnings.push(
        typeof typedSafetyRetry.message === "string"
          ? typedSafetyRetry.message
          : "The first generated plan needed a safety retry before it was saved.",
      );
    }
  }
  const ruleValidation = (metaJson as { ruleValidation?: unknown })
    .ruleValidation;
  if (
    ruleValidation &&
    typeof ruleValidation === "object" &&
    !Array.isArray(ruleValidation)
  ) {
    const typedRuleValidation = ruleValidation as {
      ok?: unknown;
      violations?: unknown;
    };
    if (
      typedRuleValidation.ok === false &&
      Array.isArray(typedRuleValidation.violations)
    ) {
      for (const violation of typedRuleValidation.violations) {
        if (
          !violation ||
          typeof violation !== "object" ||
          Array.isArray(violation)
        )
          continue;
        const message = (violation as { message?: unknown; code?: unknown })
          .message;
        const code = (violation as { message?: unknown; code?: unknown }).code;
        warnings.push(
          typeof message === "string"
            ? message
            : typeof code === "string"
              ? code
              : "Plan has a physiological rule warning.",
        );
      }
    }
  }
  return warnings;
}
