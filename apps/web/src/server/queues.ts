import { Queue } from "bullmq";
import IORedis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(url, { maxRetriesPerRequest: null });

export const stravaSyncQueue = new Queue("strava-sync", { connection });
export const trainingLoadQueue = new Queue("training-load", { connection });
export const activitySummaryQueue = new Queue("activity-summary", { connection });
