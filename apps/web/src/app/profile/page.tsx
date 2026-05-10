import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { AppNavTabs } from "@/components/AppNavTabs";

export default async function ProfilePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const [user, token, activityCount, latestMetric] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.stravaToken.findUnique({
      where: { userId },
      select: { lastSyncedAt: true, scope: true, athleteJson: true },
    }),
    prisma.activity.count({ where: { userId } }),
    prisma.dailyMetric.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { date: true, restingHr: true },
    }),
  ]);

  if (!user) redirect("/");

  const athlete = (token?.athleteJson ?? null) as null | {
    profile?: string;
    profile_medium?: string;
    city?: string;
    state?: string;
    country?: string;
    created_at?: string;
  };

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";
  const lastSync = token?.lastSyncedAt
    ? new Date(token.lastSyncedAt).toLocaleString()
    : "Never";
  const memberSince = athlete?.created_at
    ? new Date(athlete.created_at).toLocaleDateString()
    : "—";
  const location =
    [athlete?.city, athlete?.state, athlete?.country]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="space-y-4">
        <h1 className="text-2xl font-semibold">Athlete Profile</h1>
        <AppNavTabs />
      </header>

      <section className="flex items-center gap-4 rounded border border-neutral-200 p-4">
        {athlete?.profile_medium || athlete?.profile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={athlete.profile_medium ?? athlete.profile}
            alt="Strava profile"
            className="h-16 w-16 rounded-full border border-neutral-200"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-xl text-neutral-500">
            {(user.firstName?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div>
          <div className="text-lg font-medium">{fullName}</div>
          <div className="text-sm text-neutral-500">
            {user.email ?? "No email on file"}
          </div>
          <div className="text-xs text-neutral-400">
            Strava ID {String(user.stravaId)} · {location}
          </div>
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          Physiological thresholds
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Field label="Sex" value={user.sex ?? "—"} />
          <Field
            label="Weight"
            value={user.weightKg ? `${user.weightKg.toFixed(1)} kg` : "—"}
          />
          <Field label="Units" value={user.measurement} />
          <Field
            label="FTP"
            value={user.ftpWatts ? `${user.ftpWatts} W` : "—"}
            hint="Functional Threshold Power (cycling)"
          />
          <Field
            label="Max HR"
            value={user.maxHr ? `${user.maxHr} bpm` : "—"}
            hint="From Strava HR zones"
          />
          <Field
            label="Resting HR"
            value={user.restingHr ? `${user.restingHr} bpm` : "Not set"}
            hint="Enter via daily check-in"
          />
        </dl>
        <p className="mt-4 text-xs text-neutral-500">
          FTP, weight, sex, and max HR are auto-populated from Strava on every
          sync. Resting HR is private to Strava — set yours in the{" "}
          <Link href="/checkin" className="underline">
            daily check-in
          </Link>
          .
        </p>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          Current training load
        </h2>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <Field label="Fitness (CTL)" value={fmtNum(user.currentCtl)} />
          <Field label="Fatigue (ATL)" value={fmtNum(user.currentAtl)} />
          <Field label="Form (TSB)" value={fmtNum(user.currentTsb)} />
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Last computed:{" "}
          {user.loadComputedAt
            ? new Date(user.loadComputedAt).toLocaleString()
            : "Never"}
        </p>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          Strava connection
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Last sync" value={lastSync} />
          <Field label="Activities synced" value={String(activityCount)} />
          <Field label="Strava member since" value={memberSince} />
          <Field label="OAuth scope" value={token?.scope ?? "—"} />
          <Field
            label="Latest check-in"
            value={
              latestMetric?.date
                ? new Date(latestMetric.date).toLocaleDateString()
                : "Never"
            }
          />
        </dl>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-base font-medium">{value}</dd>
      {hint ? <div className="text-xs text-neutral-400">{hint}</div> : null}
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1);
}
