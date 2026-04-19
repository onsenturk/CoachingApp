/**
 * Pull recent Strava activities for a single user.
 *
 * Job payload: { userId: string, sinceEpochSec?: number }
 */

import type { Job } from "bullmq";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@coaching/db";
import { StravaClient, type SummaryActivity } from "@coaching/strava";
import { decryptToken, encryptToken } from "../crypto.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const trainingLoadQueue = new Queue("training-load", { connection });

export interface StravaSyncPayload {
  userId: string;
  sinceEpochSec?: number;
}

const stravaClient = new StravaClient({
  clientId: process.env.STRAVA_CLIENT_ID ?? "",
  clientSecret: process.env.STRAVA_CLIENT_SECRET ?? "",
});

/**
 * Initial backfill window for a fresh user (no `lastSyncedAt` yet).
 *
 * 90 days is enough to seed a meaningful CTL curve (≈6× CTL time-constant of
 * 42d → ~95% of steady-state) without pulling years of history we won't use.
 * Subsequent syncs are incremental from `lastSyncedAt`.
 */
const INITIAL_BACKFILL_DAYS = 90;


export async function runStravaSync(job: Job<StravaSyncPayload>) {
  const { userId, sinceEpochSec } = job.data;

  const tokenRow = await prisma.stravaToken.findUnique({ where: { userId } });
  if (!tokenRow) throw new Error(`No Strava token for user ${userId}`);

  let accessToken = await decryptToken(Buffer.from(tokenRow.accessTokenEnc));
  let expiresAt = tokenRow.expiresAt;

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const refresh = await decryptToken(Buffer.from(tokenRow.refreshTokenEnc));
    const refreshed = await stravaClient.refreshToken(refresh);
    accessToken = refreshed.access_token;
    expiresAt = new Date(refreshed.expires_at * 1000);
    await prisma.stravaToken.update({
      where: { userId },
      data: {
        accessTokenEnc: await encryptToken(refreshed.access_token),
        refreshTokenEnc: await encryptToken(refreshed.refresh_token),
        expiresAt,
      },
    });
  }

  const since =
    sinceEpochSec ??
    Math.floor(
      (tokenRow.lastSyncedAt?.getTime() ??
        Date.now() - INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000) / 1000,
    );

  let count = 0;
  for await (const a of stravaClient.iterateAllActivities(accessToken, since)) {
    await upsertActivity(userId, a);
    count++;
  }

  await prisma.stravaToken.update({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  await trainingLoadQueue.add("recompute", { userId });
  return { upserted: count };
}

async function upsertActivity(userId: string, a: SummaryActivity) {
  const id = BigInt(a.id);
  const wAvgW =
    a.weighted_average_watts !== undefined ? Math.round(a.weighted_average_watts) : null;
  await prisma.activity.upsert({
    where: { id },
    create: {
      id,
      userId,
      name: a.name,
      sportType: a.sport_type,
      startDate: new Date(a.start_date),
      startDateLocal: new Date(a.start_date_local),
      timezone: a.timezone ?? null,
      distance: a.distance,
      movingTime: a.moving_time,
      elapsedTime: a.elapsed_time,
      elevationGain: a.total_elevation_gain ?? null,
      averageHr: a.average_heartrate ?? null,
      maxHr: a.max_heartrate ?? null,
      averageWatts: a.average_watts ?? null,
      weightedAvgWatts: wAvgW,
      averageSpeed: a.average_speed ?? null,
      averageCadence: a.average_cadence ?? null,
      kilojoules: a.kilojoules ?? null,
      trainer: a.trainer ?? false,
      manual: a.manual ?? false,
      hasHeartrate: a.has_heartrate ?? false,
      deviceWatts: a.device_watts ?? false,
      rawJson: a as unknown as object,
    },
    update: {
      name: a.name,
      distance: a.distance,
      movingTime: a.moving_time,
      elapsedTime: a.elapsed_time,
      averageHr: a.average_heartrate ?? null,
      maxHr: a.max_heartrate ?? null,
      averageWatts: a.average_watts ?? null,
      weightedAvgWatts: wAvgW,
      rawJson: a as unknown as object,
    },
  });
}
