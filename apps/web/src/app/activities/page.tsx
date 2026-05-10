import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { prisma } from "@coaching/db";
import { ActivityDetailCard } from "@/components/ActivityDetailCard";
import { AppNavTabs } from "@/components/AppNavTabs";
import { findBestActivityMatch } from "@/lib/activitySessionMatching";
import { sportLabel } from "./activityFormat";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { page: pageParam, type: typeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const sportTypeGroups = await prisma.activity.groupBy({
    by: ["sportType"],
    where: { userId },
    _count: { _all: true },
  });
  const sortedSportTypeGroups = sportTypeGroups.sort(
    (a, b) => b._count._all - a._count._all,
  );
  const availableSportTypes = new Set(sortedSportTypeGroups.map((group) => group.sportType));
  const selectedSportType =
    typeParam && availableSportTypes.has(typeParam) ? typeParam : undefined;
  const activityWhere = selectedSportType
    ? { userId, sportType: selectedSportType }
    : { userId };

  const [user, activeProgram, total, activities] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { weightKg: true },
    }),
    prisma.program.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.activity.count({ where: activityWhere }),
    prisma.activity.findMany({
      where: activityWhere,
      orderBy: { startDate: "desc" },
      skip,
      take: PAGE_SIZE,
      include: { summary: { select: { text: true } } },
    }),
  ]);

  const weightKg = user?.weightKg ?? 75;
  const allActivitiesTotal = sortedSportTypeGroups.reduce(
    (sum, group) => sum + group._count._all,
    0,
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activityDates = [
    ...new Set(
      activities.map((activity) =>
        activity.startDateLocal.toISOString().slice(0, 10),
      ),
    ),
  ];
  const plannedSessions = activityDates.length
    ? await prisma.plannedSession.findMany({
        where: {
          programId: activeProgram?.id ?? "",
          date: { in: activityDates.map((date) => new Date(date)) },
        },
      })
    : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">All activities</h1>
          <span className="text-xs text-neutral-500">
            {selectedSportType ? `${total} ${sportLabel(selectedSportType)}` : `${total} total`}
          </span>
        </div>
        <AppNavTabs />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Runs show pace. Rides show speed and power when Strava provides it.
        </p>
        {sortedSportTypeGroups.length > 0 && (
          <div className="flex max-w-full flex-wrap gap-2 text-xs">
            <ActivityFilterLink
              href="/activities"
              active={!selectedSportType}
              label="All"
              count={allActivitiesTotal}
            />
            {sortedSportTypeGroups.map((group) => (
              <ActivityFilterLink
                key={group.sportType}
                href={`/activities?type=${encodeURIComponent(group.sportType)}`}
                active={selectedSportType === group.sportType}
                label={sportLabel(group.sportType)}
                count={group._count._all}
              />
            ))}
          </div>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="text-neutral-500">No activities synced yet.</p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => {
            const plannedSession = plannedSessions.find(
              (session) => findBestActivityMatch(session, [activity]) != null,
            );
            return (
              <ActivityDetailCard
                key={activity.id.toString()}
                activity={activity}
                weightKg={weightKg}
                plannedSession={plannedSession ?? null}
              />
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <PageLink
            page={page - 1}
            disabled={page <= 1}
            label="← Previous"
            sportType={selectedSportType}
          />
          <span className="text-neutral-500">
            Page {page} of {totalPages}
          </span>
          <PageLink
            page={page + 1}
            disabled={page >= totalPages}
            label="Next →"
            sportType={selectedSportType}
          />
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        Calories are estimated from kilojoules (cycling) or sport-based MET ×
        duration when Strava doesn&apos;t provide a value. Set your weight in
        your profile for better accuracy.
      </p>
    </main>
  );
}

function ActivityFilterLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href as Route}
      className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
      }`}
    >
      {label} <span className={active ? "text-neutral-300" : "text-neutral-400"}>{count}</span>
    </Link>
  );
}

function PageLink({
  page,
  disabled,
  label,
  sportType,
}: {
  page: number;
  disabled: boolean;
  label: string;
  sportType?: string;
}) {
  if (disabled) {
    return <span className="text-neutral-300">{label}</span>;
  }
  return (
    <Link
      href={
        `/activities?page=${page}${sportType ? `&type=${encodeURIComponent(sportType)}` : ""}` as Route
      }
      className="rounded-md border border-neutral-200 px-3 py-2 text-neutral-700 hover:bg-neutral-50"
    >
      {label}
    </Link>
  );
}
