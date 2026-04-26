import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";

const DAYS_AHEAD = 14;
const DAYS_BACK = 7;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const FEASIBILITY_CHIP: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
};

const STATUS_CHIP: Record<string, string> = {
  planned: "bg-neutral-100 text-neutral-700",
  done: "bg-emerald-100 text-emerald-800",
  skipped: "bg-neutral-200 text-neutral-600 line-through",
  adjusted: "bg-amber-100 text-amber-800",
};

export default async function CalendarPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - DAYS_BACK);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + DAYS_AHEAD);

  const [activeProgram, planned, activities] = await Promise.all([
    prisma.program.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.plannedSession.findMany({
      where: {
        program: { userId },
        date: { gte: start, lte: end },
      },
      orderBy: { date: "asc" },
    }),
    prisma.activity.findMany({
      where: {
        userId,
        startDateLocal: { gte: start, lte: end },
      },
      orderBy: { startDateLocal: "asc" },
    }),
  ]);

  const byDay = new Map<
    string,
    { planned: typeof planned; activities: typeof activities }
  >();
  for (let i = -DAYS_BACK; i <= DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    byDay.set(dayKey(d), { planned: [], activities: [] });
  }
  for (const p of planned) byDay.get(dayKey(p.date))?.planned.push(p);
  for (const a of activities) byDay.get(dayKey(a.startDateLocal))?.activities.push(a);

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
    const goalLabel = goalLabels[activeProgram.goalType] ?? activeProgram.goalType;
    const elapsedDays = Math.floor(
      (today.getTime() - activeProgram.createdAt.getTime()) / 86_400_000,
    );
    const currentWeek = Math.min(
      activeProgram.weeksTotal,
      Math.max(1, Math.floor(elapsedDays / 7) + 1),
    );
    const chipClass =
      FEASIBILITY_CHIP[activeProgram.feasibility] ?? "bg-neutral-100 text-neutral-700";
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
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/dashboard" className="underline">Dashboard</Link>
          <Link href="/coach" className="underline">Coach</Link>
          <Link href="/checkin" className="underline">Check-in</Link>
        </nav>
      </header>
      {programHeader}
      <p className="mb-4 text-sm text-neutral-500">
        Past {DAYS_BACK} days and next {DAYS_AHEAD} days. Planned sessions come
        from your program; activities from Strava.
      </p>
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
                  <div className="text-xs font-semibold text-amber-700">today</div>
                )}
              </div>
              <div className="grow">
                {empty && <div className="text-xs text-neutral-400">— rest —</div>}
                {ps.map((p) => (
                  <div key={p.id} className="text-sm">
                    <span className="font-medium">{p.workoutType}</span>
                    {p.durationMin ? (
                      <span className="text-neutral-500"> · {p.durationMin}min</span>
                    ) : null}
                    {p.distanceM ? (
                      <span className="text-neutral-500">
                        {" "}· {(p.distanceM / 1000).toFixed(1)}km
                      </span>
                    ) : null}
                    {p.isHard && (
                      <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
                        hard
                      </span>
                    )}
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        STATUS_CHIP[p.status] ?? "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {p.status}
                    </span>
                    <div className="text-xs text-neutral-600">{p.description}</div>
                  </div>
                ))}
                {acts.map((a) => (
                  <div key={a.id.toString()} className="text-sm text-neutral-700">
                    <span className="text-emerald-700">✓</span>{" "}
                    <span className="font-medium">{a.sportType}</span> ·{" "}
                    {(a.distance / 1000).toFixed(1)}km ·{" "}
                    {Math.round(a.movingTime / 60)}min
                    {a.tss !== null ? (
                      <span className="text-neutral-500"> · TSS {Math.round(a.tss)}</span>
                    ) : a.trimp !== null ? (
                      <span className="text-neutral-500">
                        {" "}· TRIMP {Math.round(a.trimp)}
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
