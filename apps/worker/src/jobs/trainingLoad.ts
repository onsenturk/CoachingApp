/**
 * Recompute TRIMP/TSS per activity + CTL/ATL/TSB curve for a user.
 *
 * Job payload: { userId: string }
 */

import type { Job } from "bullmq";
import { prisma } from "@coaching/db";
import { trimp, tss, ctlAtl } from "@coaching/training";

export interface TrainingLoadPayload {
  userId: string;
}

export async function runTrainingLoad(job: Job<TrainingLoadPayload>) {
  const { userId } = job.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User not found: ${userId}`);

  const activities = await prisma.activity.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
  });

  for (const a of activities) {
    let trimpVal: number | null = null;
    let tssVal: number | null = null;
    if (a.averageHr && user.maxHr && user.restingHr) {
      trimpVal = trimp.trimpBanister({
        durationSec: a.movingTime,
        averageHr: a.averageHr,
        restingHr: user.restingHr,
        maxHr: user.maxHr,
        sex: (user.sex as "M" | "F" | undefined) ?? "M",
      });
    }
    if (a.weightedAvgWatts && user.ftpWatts) {
      tssVal = tss.tss({
        durationSec: a.movingTime,
        normalizedPowerW: a.weightedAvgWatts,
        ftpW: user.ftpWatts,
      });
    }
    if (trimpVal !== null || tssVal !== null) {
      await prisma.activity.update({
        where: { id: a.id },
        data: { trimp: trimpVal, tss: tssVal },
      });
    }
  }

  // Daily roll-up + EMA curve
  const refreshed = await prisma.activity.findMany({
    where: { userId },
    orderBy: { startDate: "asc" },
  });
  const byDay = new Map<string, number>();
  for (const a of refreshed) {
    const d = a.startDate.toISOString().slice(0, 10);
    const load = a.tss ?? a.trimp ?? 0;
    byDay.set(d, (byDay.get(d) ?? 0) + load);
  }
  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, load]) => ({ date, load }));
  const curve = ctlAtl.computeCtlAtl(series);

  const latest = curve[curve.length - 1];
  if (latest) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentCtl: latest.ctl,
        currentAtl: latest.atl,
        currentTsb: latest.tsb,
        loadComputedAt: new Date(),
      },
    });
  }

  return { activitiesScored: refreshed.length, curveLength: curve.length };
}
