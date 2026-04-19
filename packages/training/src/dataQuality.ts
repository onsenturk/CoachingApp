/**
 * Data-quality guardrails (G4).
 *
 * Refuse plan generation when the dataset is too thin or unreliable;
 * surface what the user must self-report instead.
 */

import type { ActivitySummary } from "./baseline.js";

export interface DataQualityIssue {
  code: string;
  message: string;
  needsUserInput?: string[]; // field names the UI should ask for
}

export interface DataQualityReport {
  ok: boolean;
  issues: DataQualityIssue[];
  weeksOfHistory: number;
  totalActivities: number;
}

export const MIN_WEEKS_OF_HISTORY = 4;
export const MIN_ACTIVITIES_FOR_PLAN = 8;

export function assess(activities: ActivitySummary[], sport: "run" | "bike" | "both"): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  if (activities.length === 0) {
    return {
      ok: false,
      issues: [
        {
          code: "NO_HISTORY",
          message:
            "No Strava activity history yet — please tell us your current fitness baseline.",
          needsUserInput: ["weeklyKm", "longestRunKm", "recentRaceTime"],
        },
      ],
      weeksOfHistory: 0,
      totalActivities: 0,
    };
  }

  const earliest = activities.reduce(
    (min, a) => (a.startDate < min ? a.startDate : min),
    new Date(),
  );
  const weeks =
    (Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 7);

  if (weeks < MIN_WEEKS_OF_HISTORY) {
    issues.push({
      code: "INSUFFICIENT_HISTORY",
      message: `Only ${weeks.toFixed(1)} weeks of history; need ≥ ${MIN_WEEKS_OF_HISTORY}.`,
      needsUserInput: ["weeklyKm", "longestRunKm", "recentRaceTime"],
    });
  }

  if (activities.length < MIN_ACTIVITIES_FOR_PLAN) {
    issues.push({
      code: "TOO_FEW_ACTIVITIES",
      message: `Only ${activities.length} activities; need ≥ ${MIN_ACTIVITIES_FOR_PLAN}.`,
      needsUserInput: ["weeklyKm", "longestRunKm"],
    });
  }

  if (sport === "run" || sport === "both") {
    const runs = activities.filter((a) => a.sportType.includes("Run"));
    if (runs.length === 0) {
      issues.push({
        code: "NO_RUNS",
        message: "No run activities found. Please log a run or pick cycling-only.",
        needsUserInput: ["weeklyKm", "longestRunKm"],
      });
    }
  }
  if (sport === "bike" || sport === "both") {
    const rides = activities.filter((a) =>
      ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"].includes(a.sportType),
    );
    if (rides.length === 0) {
      issues.push({
        code: "NO_RIDES",
        message: "No ride activities found.",
        needsUserInput: ["weeklyHours", "ftpWatts"],
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    weeksOfHistory: weeks,
    totalActivities: activities.length,
  };
}
