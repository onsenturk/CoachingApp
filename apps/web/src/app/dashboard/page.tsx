import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { SyncNowButton } from "./SyncNowButton";
import { estimateCalories, formatDistance, formatDuration } from "../activities/activityFormat";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const [user, recentActivities, todayPlanned] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.activity.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      take: 5,
    }),
    prisma.plannedSession.findFirst({
      where: {
        program: { userId },
        date: new Date(new Date().toISOString().slice(0, 10)),
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/checkin" className="underline">Check-in</Link>
          <Link href="/calendar" className="underline">Calendar</Link>
          <Link href="/coach" className="underline">Coach</Link>
          <Link href="/profile" className="underline">Profile</Link>
          <SyncNowButton />
        </nav>
      </header>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Today&apos;s session</h2>
        {todayPlanned ? (
          <div>
            <div className="text-lg font-medium">{todayPlanned.workoutType}</div>
            <p className="text-neutral-600">{todayPlanned.description}</p>
          </div>
        ) : (
          <p className="text-neutral-500">No session planned for today.</p>
        )}
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">Fitness</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat
            label="Fitness"
            sub="CTL · 42-day load"
            value={user?.currentCtl}
            interpretation={interpretCtl(user?.currentCtl)}
            help={
              <>
                <p>
                  <b>Chronic Training Load</b> — exponentially-weighted average of your daily
                  training stress over ~42 days. Long-term aerobic fitness.
                </p>
                <p className="mt-2">Rough bands (running):</p>
                <ul className="mt-1 list-disc pl-4">
                  <li>30–50 — recreational</li>
                  <li>60–80 — competitive amateur</li>
                  <li>90–120 — serious endurance athlete</li>
                  <li>130+ — elite volume</li>
                </ul>
                <p className="mt-2">
                  Healthy build = ~3–7 pts/week. &gt;8 pts/week often means injury risk.
                </p>
              </>
            }
          />
          <Stat
            label="Fatigue"
            sub="ATL · 7-day load"
            value={user?.currentAtl}
            interpretation={interpretAtl(user?.currentAtl, user?.currentCtl)}
            help={
              <>
                <p>
                  <b>Acute Training Load</b> — 7-day exponentially-weighted average. How cooked
                  you are right now.
                </p>
                <p className="mt-2">
                  Useful mainly relative to CTL: when ATL &gt; CTL you are accumulating fatigue;
                  when ATL &lt; CTL you are recovering / tapering.
                </p>
              </>
            }
          />
          <Stat
            label="Form"
            sub="TSB · Fitness − Fatigue"
            value={user?.currentTsb}
            interpretation={interpretTsb(user?.currentTsb)}
            help={
              <>
                <p>
                  <b>Training Stress Balance</b> = CTL − ATL. Readiness indicator.
                </p>
                <ul className="mt-2 list-disc pl-4">
                  <li>
                    <b>&gt; +25</b> — too rested, losing fitness
                  </li>
                  <li>
                    <b>+5 to +25</b> — fresh, race-ready
                  </li>
                  <li>
                    <b>−10 to +5</b> — neutral, productive training
                  </li>
                  <li>
                    <b>−10 to −30</b> — productive overload, watch fatigue
                  </li>
                  <li>
                    <b>&lt; −30</b> — high injury / illness risk
                  </li>
                </ul>
              </>
            }
          />
        </div>
        {(!user?.currentCtl || user.currentCtl === 0) && (
          <p className="mt-3 text-xs text-neutral-500">
            Showing 0 because none of your synced activities have a power or heart-rate-based
            training stress score yet. Add your FTP / HR thresholds in settings, or sync rides
            with power data, to see these populate.
          </p>
        )}
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-500">Recent activities</h2>
          <Link href="/activities" className="text-xs text-neutral-500 underline">
            See all →
          </Link>
        </div>
        {recentActivities.length === 0 ? (
          <p className="text-neutral-500">No activities synced yet.</p>
        ) : (
          <ul className="divide-y">
            {recentActivities.map((a) => {
              const kcal = estimateCalories(a, user?.weightKg ?? 75);
              return (
                <li key={a.id.toString()} className="py-2 text-sm">
                  <span className="font-mono text-xs text-neutral-500">
                    {a.startDateLocal.toISOString().slice(0, 10)}
                  </span>{" "}
                  · <span className="font-medium">{a.sportType}</span> ·{" "}
                  {formatDistance(a.distance)} · {formatDuration(a.movingTime)} ·{" "}
                  <span className="text-neutral-700">{kcal.toLocaleString()} kcal</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  sub,
  value,
  help,
  interpretation,
}: {
  label: string;
  sub?: string;
  value: number | null | undefined;
  help?: React.ReactNode;
  interpretation?: { tone: "good" | "warn" | "bad" | "neutral"; text: string } | null;
}) {
  const toneClass =
    interpretation?.tone === "good"
      ? "text-emerald-700"
      : interpretation?.tone === "warn"
        ? "text-amber-700"
        : interpretation?.tone === "bad"
          ? "text-rose-700"
          : "text-neutral-600";

  return (
    <div className="group relative">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-700">{label}</div>
      <div className="text-2xl font-semibold">{value?.toFixed(0) ?? "—"}</div>
      {sub && <div className="mt-0.5 text-[10px] text-neutral-400">{sub}</div>}
      {interpretation && (
        <div className={`mt-1 text-[11px] font-medium ${toneClass}`}>{interpretation.text}</div>
      )}
      {help && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-neutral-200 bg-white p-3 text-left text-xs leading-relaxed text-neutral-700 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {help}
        </div>
      )}
    </div>
  );
}

function interpretCtl(ctl: number | null | undefined) {
  if (!ctl || ctl === 0) return null;
  if (ctl < 30) return { tone: "neutral" as const, text: "Building base" };
  if (ctl < 60) return { tone: "neutral" as const, text: "Recreational" };
  if (ctl < 90) return { tone: "good" as const, text: "Competitive amateur" };
  if (ctl < 130) return { tone: "good" as const, text: "Serious endurance" };
  return { tone: "warn" as const, text: "Elite volume — manage load" };
}

function interpretAtl(atl: number | null | undefined, ctl: number | null | undefined) {
  if (atl == null || ctl == null || (atl === 0 && ctl === 0)) return null;
  const ratio = ctl > 0 ? atl / ctl : 1;
  if (ratio > 1.3) return { tone: "bad" as const, text: "Heavy fatigue spike" };
  if (ratio > 1.1) return { tone: "warn" as const, text: "Accumulating fatigue" };
  if (ratio < 0.8) return { tone: "good" as const, text: "Recovering / tapering" };
  return { tone: "neutral" as const, text: "Steady" };
}

function interpretTsb(tsb: number | null | undefined) {
  if (tsb == null) return null;
  if (tsb > 25) return { tone: "warn" as const, text: "Too rested — losing fitness" };
  if (tsb >= 5) return { tone: "good" as const, text: "Fresh, race-ready" };
  if (tsb >= -10) return { tone: "neutral" as const, text: "Productive training zone" };
  if (tsb >= -30) return { tone: "warn" as const, text: "Overload — monitor recovery" };
  return { tone: "bad" as const, text: "High injury / illness risk" };
}
