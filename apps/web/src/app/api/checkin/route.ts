/**
 * POST /api/checkin
 *   - Validates payload via zod
 *   - Persists DailyMetric (one per user-day, upsert)
 *   - Computes deterministic readiness assessment (G2)
 *   - Returns { dailyMetric, assessment } so the UI can route to /coach for adjustment
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coaching/db";
import { schemas } from "@coaching/ai";
import { readiness, ctlAtl } from "@coaching/training";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schemas.CheckInSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(parsed.error.message, { status: 400 });
  }
  const ci = parsed.data;
  const date = new Date(ci.date);

  const dailyMetric = await prisma.dailyMetric.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      readiness: ci.readiness,
      sleepHours: ci.sleepHours ?? null,
      sleepQuality: ci.sleepQuality ?? null,
      restingHr: ci.restingHr ?? null,
      soreness: ci.soreness ?? null,
      mood: ci.mood ?? null,
      injured: ci.injured,
      sick: ci.sick,
      notes: ci.notes ?? null,
    },
    update: {
      readiness: ci.readiness,
      sleepHours: ci.sleepHours ?? null,
      sleepQuality: ci.sleepQuality ?? null,
      restingHr: ci.restingHr ?? null,
      soreness: ci.soreness ?? null,
      mood: ci.mood ?? null,
      injured: ci.injured,
      sick: ci.sick,
      notes: ci.notes ?? null,
    },
  });

  // Build readiness context: 14d RHR avg + recent TSB run
  const last14 = await prisma.dailyMetric.findMany({
    where: { userId, date: { gte: new Date(Date.now() - 14 * 86400000) } },
    select: { restingHr: true },
  });
  const rhrVals = last14.map((m) => m.restingHr).filter((v): v is number => v !== null);
  const rhr14dAvg = rhrVals.length
    ? rhrVals.reduce((a, b) => a + b, 0) / rhrVals.length
    : undefined;

  // Pull last 60 days of activities to recompute a short TSB tail
  const recent = await prisma.activity.findMany({
    where: { userId, startDate: { gte: new Date(Date.now() - 60 * 86400000) } },
    orderBy: { startDate: "asc" },
    select: { startDate: true, tss: true, trimp: true },
  });
  const byDay = new Map<string, number>();
  for (const a of recent) {
    const d = a.startDate.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + (a.tss ?? a.trimp ?? 0));
  }
  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, load]) => ({ date: d, load }));
  const curve = ctlAtl.computeCtlAtl(series);
  const tsb = curve[curve.length - 1]?.tsb;
  const tsbBelowDays = ctlAtl.consecutiveDaysTsbBelow(curve, -25);

  const assessment = readiness.assessReadiness(
    {
      readiness: ci.readiness,
      sleepHours: ci.sleepHours,
      sleepQuality: ci.sleepQuality,
      restingHr: ci.restingHr,
      soreness: ci.soreness,
      injured: ci.injured,
      sick: ci.sick,
    },
    { rhr14dAvg, tsb, tsbBelowThresholdDays: tsbBelowDays },
  );

  return NextResponse.json({ dailyMetric: { id: dailyMetric.id }, assessment });
}
