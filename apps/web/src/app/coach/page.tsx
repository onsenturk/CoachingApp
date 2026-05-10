import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { GoalForm } from "./GoalForm";
import { AppNavTabs } from "@/components/AppNavTabs";

export default async function CoachPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const activeProgram = await prisma.program.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { plannedSessions: true } } },
  });

  const foundryConfigured = Boolean(process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 space-y-4">
        <h1 className="text-2xl font-semibold">Coach</h1>
        <AppNavTabs />
      </header>

      {!foundryConfigured && (
        <section className="mb-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-medium">AI coach not configured.</div>
          <p className="mt-1">
            Set <code>AZURE_FOUNDRY_PROJECT_ENDPOINT</code> in <code>.env</code>{" "}
            and run <code>pnpm agents:sync</code> to enable plan generation.
          </p>
        </section>
      )}

      {activeProgram ? (
        <ActiveProgramCard
          program={activeProgram}
          foundryConfigured={foundryConfigured}
        />
      ) : (
        <NewProgramCard foundryConfigured={foundryConfigured} />
      )}
    </main>
  );
}

function NewProgramCard({ foundryConfigured }: { foundryConfigured: boolean }) {
  return (
    <section className="rounded border border-neutral-200 p-5">
      <h2 className="mb-1 text-lg font-medium">Build me a training plan</h2>
      <p className="mb-5 text-sm text-neutral-600">
        Pick a race, optionally a finish-time target, and how long you want to
        train. The AI coach will generate a periodized plan grounded in your
        Strava history and physiological constraints (volume ramp &le;10%/wk,
        80/20 polarized, recovery weeks every 4th, taper).
      </p>
      <fieldset disabled={!foundryConfigured} className="space-y-4">
        <GoalForm />
      </fieldset>
    </section>
  );
}

type ActiveProgram = {
  id: string;
  goalType: string;
  goalTargetSec: number | null;
  goalDate: Date | null;
  weeksTotal: number;
  sessionsPerWk: number;
  feasibility: string;
  feasibilityReason: string | null;
  createdAt: Date;
  _count: { plannedSessions: number };
};

function ActiveProgramCard({
  program,
  foundryConfigured,
}: {
  program: ActiveProgram;
  foundryConfigured: boolean;
}) {
  const startedAt = program.createdAt;
  const totalDays = program.weeksTotal * 7;
  const elapsedDays = Math.floor(
    (Date.now() - startedAt.getTime()) / 86_400_000,
  );
  const currentWeek = Math.min(
    program.weeksTotal,
    Math.max(1, Math.floor(elapsedDays / 7) + 1),
  );
  const daysLeft = Math.max(0, totalDays - elapsedDays);

  const goalLabel = formatGoalLabel(program);
  const targetTime = program.goalTargetSec
    ? formatHms(program.goalTargetSec)
    : null;

  const colors: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
  };
  const chipClass =
    colors[program.feasibility] ?? "bg-neutral-100 text-neutral-700";

  return (
    <section className="space-y-5">
      <div className="rounded border border-neutral-200 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">{goalLabel}</h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${chipClass}`}
          >
            feasibility &middot; {program.feasibility}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Field
            label="Race day"
            value={
              program.goalDate ? program.goalDate.toLocaleDateString() : "—"
            }
          />
          <Field label="Target time" value={targetTime ?? "—"} />
          <Field
            label="Week"
            value={`${currentWeek} / ${program.weeksTotal}`}
          />
          <Field label="Days left" value={String(daysLeft)} />
          <Field label="Sessions / wk" value={String(program.sessionsPerWk)} />
          <Field
            label="Sessions total"
            value={String(program._count.plannedSessions)}
          />
        </dl>
        {program.feasibilityReason && (
          <p className="mt-3 text-xs text-neutral-600">
            {program.feasibilityReason}
          </p>
        )}
        <div className="mt-4 flex gap-3 text-sm">
          <Link href="/calendar" className="underline">
            View calendar →
          </Link>
        </div>
      </div>

      <div className="rounded border border-neutral-200 p-5">
        <h2 className="text-base font-medium">Replace this plan</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-600">
          Approve replacement before generating. The current plan is archived only after the new
          plan is created successfully.
        </p>
        <fieldset disabled={!foundryConfigured} className="space-y-4">
          <GoalForm requiresReplacementApproval />
        </fieldset>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-base font-medium">{value}</dd>
    </div>
  );
}

function formatGoalLabel(p: ActiveProgram): string {
  const presetLabels: Record<string, string> = {
    "5k": "5K",
    "10k": "10K",
    half: "Half marathon",
    marathon: "Marathon",
    custom: "Custom race",
  };
  return presetLabels[p.goalType] ?? p.goalType;
}

function formatHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
