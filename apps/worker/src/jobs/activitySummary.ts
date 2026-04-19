/**
 * Generate AI summary for a single activity via Foundry agent + governance.
 *
 * Job payload: { userId: string, activityId: string } (activityId is the Strava id as string)
 */

import type { Job } from "bullmq";
import { prisma } from "@coaching/db";
import { FoundryAgentClient, govern, RunCounter, type AuditWriter } from "@coaching/ai";

export interface ActivitySummaryPayload {
  userId: string;
  activityId: string;
}

const foundry = new FoundryAgentClient({
  projectEndpoint: process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT ?? "",
  agentNamePrefix: process.env.AZURE_FOUNDRY_AGENT_PREFIX ?? "coaching",
});

const audit: AuditWriter = async (entry) => {
  await prisma.aIRunLog.create({
    data: {
      agent: entry.agent,
      tool: entry.tool,
      decision: entry.decision,
      reason: entry.reason ?? null,
      policyName: entry.policyName ?? null,
      evidenceJson: (entry.evidenceJson as object | undefined) ?? undefined,
    },
  });
};

const SUMMARY_MODEL = process.env.AZURE_FOUNDRY_MODEL ?? "unknown";

export async function runActivitySummary(job: Job<ActivitySummaryPayload>) {
  const { userId, activityId } = job.data;
  const id = BigInt(activityId);
  const activity = await prisma.activity.findFirst({ where: { id, userId } });
  if (!activity) throw new Error(`Activity not found: ${activityId}`);

  // Find a planned session for the same user+date by joining through Program.
  const planned = await prisma.plannedSession.findFirst({
    where: {
      date: activity.startDateLocal,
      program: { userId },
    },
  });

  const counter = new RunCounter();
  const decision = await govern(
    { agent: "activity-summary", tool: "get_activity", args: { activityId } },
    { runCounter: counter, audit },
  );
  if (decision.decision !== "allow") {
    return { skipped: true, reason: decision.reason };
  }

  const message = JSON.stringify({
    activity: {
      sport: activity.sportType,
      distanceM: activity.distance,
      movingTimeSec: activity.movingTime,
      averageHr: activity.averageHr,
      averageWatts: activity.averageWatts,
      tss: activity.tss,
      trimp: activity.trimp,
    },
    planned: planned
      ? {
          workoutType: planned.workoutType,
          description: planned.description,
          targetDurationMin: planned.durationMin,
          targetDistanceM: planned.distanceM,
        }
      : null,
  });

  const out = await foundry.invoke({
    useCaseId: "activity-summary",
    message,
    metadata: { userId, activityId },
  });

  await prisma.activitySummary.upsert({
    where: { activityId: id },
    create: { activityId: id, text: out.outputText, model: SUMMARY_MODEL },
    update: { text: out.outputText, model: SUMMARY_MODEL },
  });

  return { summarized: true };
}
