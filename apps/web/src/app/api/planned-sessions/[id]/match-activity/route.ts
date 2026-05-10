import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coaching/db";
import { findBestActivityMatch } from "@/lib/activitySessionMatching";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const plannedSession = await prisma.plannedSession.findFirst({
    where: { id, program: { userId } },
    select: {
      id: true,
      date: true,
      sport: true,
      workoutType: true,
      durationMin: true,
      distanceM: true,
      status: true,
    },
  });

  if (!plannedSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (plannedSession.status === "done") {
    return NextResponse.json({
      matched: true,
      status: "done",
      alreadyDone: true,
    });
  }

  const start = new Date(plannedSession.date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const activities = await prisma.activity.findMany({
    where: {
      userId,
      startDateLocal: { gte: start, lt: end },
    },
    orderBy: { startDateLocal: "desc" },
    select: {
      id: true,
      sportType: true,
      startDateLocal: true,
      distance: true,
      movingTime: true,
      name: true,
    },
  });

  const match = findBestActivityMatch(plannedSession, activities);
  if (!match) {
    return NextResponse.json({ matched: false, status: plannedSession.status });
  }

  const updated = await prisma.plannedSession.update({
    where: { id: plannedSession.id },
    data: { status: "done" },
    select: { status: true },
  });

  return NextResponse.json({
    matched: true,
    status: updated.status,
    activity: {
      id: match.activity.id.toString(),
      name:
        activities.find((activity) => activity.id === match.activity.id)
          ?.name ?? "Activity",
      score: match.score,
    },
  });
}
