import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@coaching/db";
import { estimateCalories, formatDistance, formatDuration } from "./activityFormat";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [user, total, activities] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { weightKg: true } }),
    prisma.activity.count({ where: { userId } }),
    prisma.activity.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);

  const weightKg = user?.weightKg ?? 75;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Dashboard
        </Link>
        <span className="text-xs text-neutral-500">{total} total</span>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">All activities</h1>

      {activities.length === 0 ? (
        <p className="text-neutral-500">No activities synced yet.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Sport</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Distance</th>
                <th className="px-3 py-2 text-right">Time</th>
                <th className="px-3 py-2 text-right">Avg HR</th>
                <th className="px-3 py-2 text-right">Calories</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {activities.map((a) => (
                <tr key={a.id.toString()}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                    {a.startDateLocal.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2">{a.sportType}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-neutral-700">{a.name}</td>
                  <td className="px-3 py-2 text-right">{formatDistance(a.distance)}</td>
                  <td className="px-3 py-2 text-right">{formatDuration(a.movingTime)}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">
                    {a.averageHr ? Math.round(a.averageHr) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {estimateCalories(a, weightKg).toLocaleString()} kcal
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <PageLink page={page - 1} disabled={page <= 1} label="← Previous" />
          <span className="text-neutral-500">
            Page {page} of {totalPages}
          </span>
          <PageLink page={page + 1} disabled={page >= totalPages} label="Next →" />
        </div>
      )}

      <p className="mt-6 text-xs text-neutral-400">
        Calories are estimated from kilojoules (cycling) or sport-based MET × duration when
        Strava doesn&apos;t provide a value. Set your weight in your profile for better
        accuracy.
      </p>
    </main>
  );
}

function PageLink({ page, disabled, label }: { page: number; disabled: boolean; label: string }) {
  if (disabled) {
    return <span className="text-neutral-300">{label}</span>;
  }
  return (
    <Link href={`/activities?page=${page}`} className="text-neutral-700 underline">
      {label}
    </Link>
  );
}
