/**
 * BullMQ worker entrypoint.
 *
 * Boots three workers:
 *   - strava-sync       : pulls activities + streams from Strava
 *   - training-load     : recomputes CTL/ATL/TSB after sync
 *   - activity-summary  : invokes the activity-summary Foundry agent
 */

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { runStravaSync } from "./jobs/stravaSync.js";
import { runTrainingLoad } from "./jobs/trainingLoad.js";
import { runActivitySummary } from "./jobs/activitySummary.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

function makeWorker<T>(name: string, handler: (job: Job<T>) => Promise<unknown>) {
  const w = new Worker<T>(name, handler, { connection, concurrency: 2 });
  w.on("failed", (job, err) => {
    console.error(`[${name}] job ${job?.id} failed:`, err.message);
  });
  w.on("completed", (job) => {
    console.log(`[${name}] job ${job.id} completed`);
  });
  return w;
}

makeWorker("strava-sync", runStravaSync);
makeWorker("training-load", runTrainingLoad);
makeWorker("activity-summary", runActivitySummary);

console.log("Workers running on", redisUrl);

process.on("SIGTERM", () => {
  console.log("Shutting down workers...");
  connection.quit().then(() => process.exit(0));
});
