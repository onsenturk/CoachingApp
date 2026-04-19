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
            help="Long-term training load. Higher = fitter, but built slowly."
          />
          <Stat
            label="Fatigue"
            sub="ATL · 7-day load"
            value={user?.currentAtl}
            help="Recent training stress. High fatigue = need recovery."
          />
          <Stat
            label="Form"
            sub="TSB · Fitness − Fatigue"
            value={user?.currentTsb}
            help="Positive = fresh & ready to race. Negative = building / tired."
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
}: {
  label: string;
  sub?: string;
  value: number | null | undefined;
  help?: string;
}) {
  return (
    <div title={help}>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-700">{label}</div>
      <div className="text-2xl font-semibold">{value?.toFixed(0) ?? "—"}</div>
      {sub && <div className="mt-0.5 text-[10px] text-neutral-400">{sub}</div>}
    </div>
  );
}
