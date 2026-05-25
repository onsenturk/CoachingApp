import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { SyncNowButton } from "./SyncNowButton";
import { formatRelativeTime } from "../activities/activityFormat";
import {
  WeeklyVolumeChart,
  SportMixDonut,
  bucketByDay,
  bucketBySport,
} from "../activities/visuals";
import { baseline as baselineFns, racePrediction } from "@coaching/training";
import { AppNavTabs } from "@/components/AppNavTabs";
import { ActivityDetailCard } from "@/components/ActivityDetailCard";
import { PlannedSessionCard } from "@/components/PlannedSessionCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { SessionCompletionActions } from "@/components/SessionCompletionActions";
import { findBestActivityMatch } from "@/lib/activitySessionMatching";
import type { RecommendationSport } from "@coaching/training/dailyRecommendation";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const since30 = new Date();
  since30.setUTCDate(since30.getUTCDate() - 30);
  const since90 = new Date();
  since90.setUTCDate(since90.getUTCDate() - 90);

  const RUN_SPORT_TYPES = ["Run", "TrailRun", "VirtualRun"];

  const [user, activeProgram, recentActivities, last30, runs90, lastSynced] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.program.findFirst({
        where: { userId, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { id: true, sport: true },
      }),
      prisma.activity.findMany({
        where: { userId },
        orderBy: { startDate: "desc" },
        take: 5,
        include: { summary: { select: { text: true } } },
      }),
      prisma.activity.findMany({
        where: { userId, startDate: { gte: since30 } },
        orderBy: { startDate: "desc" },
        select: { sportType: true, distance: true, startDate: true },
      }),
      prisma.activity.findMany({
        where: {
          userId,
          startDate: { gte: since90 },
          sportType: { in: RUN_SPORT_TYPES },
        },
        orderBy: { startDate: "desc" },
        select: {
          startDate: true,
          sportType: true,
          distance: true,
          movingTime: true,
        },
      }),
      prisma.activity.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  // Race predictions (Riegel) from recent run efforts.
  const runBaseline = baselineFns.computeRunBaseline(
    runs90.map((a) => ({
      startDate: a.startDate,
      sportType: a.sportType,
      distanceM: a.distance,
      movingTimeSec: a.movingTime,
    })),
  );
  const predictions = racePrediction.predictRaceTimes(
    runs90.map((a) => ({
      startDate: a.startDate,
      distanceM: a.distance,
      movingTimeSec: a.movingTime,
    })),
    { thresholdPaceSecPerKm: runBaseline.thresholdPaceSecPerKm },
  );

  const recentActivityDates = [
    ...new Set(
      recentActivities.map((activity) =>
        activity.startDateLocal.toISOString().slice(0, 10),
      ),
    ),
  ];
  const recentPlannedSessions = recentActivityDates.length
    ? await prisma.plannedSession.findMany({
        where: {
          programId: activeProgram?.id ?? "",
          date: { in: recentActivityDates.map((date) => new Date(date)) },
        },
        orderBy: { date: "desc" },
      })
    : [];
  const todayPlanned = activeProgram
    ? await prisma.plannedSession.findFirst({
        where: {
          programId: activeProgram.id,
          date: new Date(new Date().toISOString().slice(0, 10)),
        },
      })
    : null;
  const initialRecommendationSport = defaultRecommendationSport(
    activeProgram?.sport,
    last30,
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <SyncNowButton />
        </div>
        <AppNavTabs />
      </header>

      {lastSynced?.createdAt && (
        <div className="-mt-4 flex items-center gap-2 text-xs text-neutral-500">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Last activity synced {formatRelativeTime(lastSynced.createdAt)}
        </div>
      )}

      <section className="rounded border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-500">
          Today&apos;s session
        </h2>
        {todayPlanned ? (
          <PlannedSessionCard
            session={todayPlanned}
            defaultOpen
            actions={
              <SessionCompletionActions
                sessionId={todayPlanned.id}
                status={todayPlanned.status}
              />
            }
          />
        ) : (
          <p className="text-neutral-500">No session planned for today.</p>
        )}
      </section>

      <RecommendationCard initialSport={initialRecommendationSport} />

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
                  <b>Chronic Training Load</b> — exponentially-weighted average
                  of your daily training stress over ~42 days. Long-term aerobic
                  fitness.
                </p>
                <p className="mt-2">Rough bands (running):</p>
                <ul className="mt-1 list-disc pl-4">
                  <li>30–50 — recreational</li>
                  <li>60–80 — competitive amateur</li>
                  <li>90–120 — serious endurance athlete</li>
                  <li>130+ — elite volume</li>
                </ul>
                <p className="mt-2">
                  Healthy build = ~3–7 pts/week. &gt;8 pts/week often means
                  injury risk.
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
                  <b>Acute Training Load</b> — 7-day exponentially-weighted
                  average. How cooked you are right now.
                </p>
                <p className="mt-2">
                  Useful mainly relative to CTL: when ATL &gt; CTL you are
                  accumulating fatigue; when ATL &lt; CTL you are recovering /
                  tapering.
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
                  <b>Training Stress Balance</b> = CTL − ATL. Readiness
                  indicator.
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
            Showing 0 because none of your synced activities have a power or
            heart-rate-based training stress score yet. Add your FTP / HR
            thresholds in settings, or sync rides with power data, to see these
            populate.
          </p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-neutral-200 p-4">
          <WeeklyVolumeChart days={bucketByDay(last30, 7)} />
        </div>
        <div className="rounded border border-neutral-200 p-4">
          <h2 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Sport mix
          </h2>
          <SportMixDonut slices={bucketBySport(last30)} />
        </div>
      </section>

      {predictions.length > 0 && (
        <section className="rounded border border-neutral-200 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-neutral-500">
              Predicted race times
            </h2>
            <span className="text-[10px] text-neutral-400">
              Riegel · last 12 weeks
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {predictions.map((p) => (
              <div
                key={p.label}
                className="rounded-md border border-neutral-100 bg-neutral-50 p-3"
                title={
                  p.source === "best-effort" &&
                  p.basisDistanceM &&
                  p.basisTimeSec
                    ? `Scaled from ${(p.basisDistanceM / 1000).toFixed(1)}km in ${racePrediction.fmtPredictedTime(p.basisTimeSec)} on ${p.basisDate?.toISOString().slice(0, 10)}`
                    : "Estimated from threshold pace"
                }
              >
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {p.label}
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-neutral-900">
                  {racePrediction.fmtPredictedTime(p.predictedSec)}
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {racePrediction.fmtPredictedPace(p.paceSecPerKm)}
                </div>
                <div
                  className={`mt-1 text-[10px] ${
                    p.source === "best-effort"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  {p.source === "best-effort" ? "from recent run" : "estimated"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-neutral-400">
            Predictions use Pete Riegel&apos;s formula (T₂ = T₁ × (D₂/D₁)
            <sup>1.06</sup>) on your fastest scaled effort in the last 12 weeks.
            Real race times also depend on course, weather, and taper.
          </p>
        </section>
      )}

      <section className="rounded border border-neutral-200 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-500">
            Recent activities
          </h2>
          <Link
            href="/activities"
            className="text-xs text-neutral-500 underline"
          >
            See all →
          </Link>
        </div>
        {recentActivities.length === 0 ? (
          <p className="text-neutral-500">No activities synced yet.</p>
        ) : (
          <div className="space-y-3">
            {recentActivities.map((activity) => {
              const plannedSession = recentPlannedSessions.find(
                (session) => findBestActivityMatch(session, [activity]) != null,
              );
              return (
                <ActivityDetailCard
                  key={activity.id.toString()}
                  activity={activity}
                  weightKg={user?.weightKg ?? 75}
                  plannedSession={plannedSession ?? null}
                  compact
                />
              );
            })}
          </div>
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
  interpretation?: {
    tone: "good" | "warn" | "bad" | "neutral";
    text: string;
  } | null;
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
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-700">
        {label}
      </div>
      <div className="text-2xl font-semibold">{value?.toFixed(0) ?? "—"}</div>
      {sub && <div className="mt-0.5 text-[10px] text-neutral-400">{sub}</div>}
      {interpretation && (
        <div className={`mt-1 text-[11px] font-medium ${toneClass}`}>
          {interpretation.text}
        </div>
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

function interpretAtl(
  atl: number | null | undefined,
  ctl: number | null | undefined,
) {
  if (atl == null || ctl == null || (atl === 0 && ctl === 0)) return null;
  const ratio = ctl > 0 ? atl / ctl : 1;
  if (ratio > 1.3) return { tone: "bad" as const, text: "Heavy fatigue spike" };
  if (ratio > 1.1)
    return { tone: "warn" as const, text: "Accumulating fatigue" };
  if (ratio < 0.8)
    return { tone: "good" as const, text: "Recovering / tapering" };
  return { tone: "neutral" as const, text: "Steady" };
}

function interpretTsb(tsb: number | null | undefined) {
  if (tsb == null) return null;
  if (tsb > 25)
    return { tone: "warn" as const, text: "Too rested — losing fitness" };
  if (tsb >= 5) return { tone: "good" as const, text: "Fresh, race-ready" };
  if (tsb >= -10)
    return { tone: "neutral" as const, text: "Productive training zone" };
  if (tsb >= -30)
    return { tone: "warn" as const, text: "Overload — monitor recovery" };
  return { tone: "bad" as const, text: "High injury / illness risk" };
}

function defaultRecommendationSport(
  activeProgramSport: string | undefined,
  activities: Array<{ sportType: string; distance: number }>,
): RecommendationSport {
  if (activeProgramSport === "bike") return "bike";
  if (activeProgramSport === "run") return "run";

  let runMeters = 0;
  let bikeMeters = 0;
  for (const activity of activities) {
    const sport = activity.sportType.toLowerCase();
    if (sport.includes("run")) runMeters += activity.distance;
    if (
      sport.includes("ride") ||
      sport.includes("bike") ||
      sport.includes("cycling")
    ) {
      bikeMeters += activity.distance;
    }
  }

  return bikeMeters > runMeters * 1.5 ? "bike" : "run";
}
