/**
 * Baseline fitness estimator.
 *
 * Uses Strava activity history to estimate threshold pace (running) or FTP
 * (cycling) and other capacity metrics needed by Plan Generator.
 *
 * Outliers > 3σ are excluded (G4 data-quality).
 */

export interface ActivitySummary {
  startDate: Date;
  sportType: string;
  distanceM: number;
  movingTimeSec: number;
  averageHr?: number;
  averageWatts?: number;
  weightedAvgWatts?: number;
}

export interface RunBaseline {
  weeklyVolumeM: number; // last 4 weeks median
  longestRunM: number; // last 12 weeks
  thresholdPaceSecPerKm?: number; // estimated from best ~30-60 min effort
  estimatedVo2PaceSecPerKm?: number;
  fourWeekActivityCount: number;
}

export interface BikeBaseline {
  weeklyVolumeM: number;
  weeklyHours: number;
  longestRideM: number;
  estimatedFtpW?: number;
  fourWeekActivityCount: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function stdDev(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

function dropOutliers(values: number[]): number[] {
  const { mean, sd } = stdDev(values);
  if (sd === 0) return values;
  return values.filter((v) => Math.abs(v - mean) <= 3 * sd);
}

function isRun(s: string): boolean {
  return ["Run", "TrailRun", "VirtualRun"].includes(s);
}

function isRide(s: string): boolean {
  return [
    "Ride",
    "VirtualRide",
    "GravelRide",
    "MountainBikeRide",
    "EBikeRide",
    "EMountainBikeRide",
  ].includes(s);
}

function weeksAgo(weeks: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return d;
}

export function computeRunBaseline(activities: ActivitySummary[]): RunBaseline {
  const runs = activities.filter((a) => isRun(a.sportType));
  const last4w = runs.filter((a) => a.startDate >= weeksAgo(4));
  const last12w = runs.filter((a) => a.startDate >= weeksAgo(12));

  // Weekly volume: median of last 4 weekly totals.
  const weekTotals = new Map<string, number>();
  for (const a of last4w) {
    const wk = isoWeekKey(a.startDate);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + a.distanceM);
  }
  const weeklyVolumeM = median([...weekTotals.values()]);
  const longestRunM = last12w.reduce((max, a) => Math.max(max, a.distanceM), 0);

  // Threshold pace estimate: best ~10K-30K-equivalent effort in last 12 weeks.
  // Use moving-time-per-km from runs ≥ 8km.
  const longRunPaces = dropOutliers(
    last12w
      .filter((a) => a.distanceM >= 8000 && a.movingTimeSec > 0)
      .map((a) => a.movingTimeSec / (a.distanceM / 1000)),
  );
  const thresholdPaceSecPerKm =
    longRunPaces.length > 0 ? Math.min(...longRunPaces) * 1.02 : undefined;

  // VO2 pace: best ~5K-equivalent.
  const shortPaces = dropOutliers(
    last12w
      .filter((a) => a.distanceM >= 4000 && a.distanceM <= 8000 && a.movingTimeSec > 0)
      .map((a) => a.movingTimeSec / (a.distanceM / 1000)),
  );
  const estimatedVo2PaceSecPerKm =
    shortPaces.length > 0 ? Math.min(...shortPaces) : undefined;

  return {
    weeklyVolumeM,
    longestRunM,
    thresholdPaceSecPerKm,
    estimatedVo2PaceSecPerKm,
    fourWeekActivityCount: last4w.length,
  };
}

export function computeBikeBaseline(activities: ActivitySummary[]): BikeBaseline {
  const rides = activities.filter((a) => isRide(a.sportType));
  const last4w = rides.filter((a) => a.startDate >= weeksAgo(4));
  const last12w = rides.filter((a) => a.startDate >= weeksAgo(12));

  const weekTotals = new Map<string, number>();
  const weekHours = new Map<string, number>();
  for (const a of last4w) {
    const wk = isoWeekKey(a.startDate);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + a.distanceM);
    weekHours.set(wk, (weekHours.get(wk) ?? 0) + a.movingTimeSec / 3600);
  }
  const longestRideM = last12w.reduce((m, a) => Math.max(m, a.distanceM), 0);

  // FTP estimate: 95% of best 20-min normalized power not available without streams here.
  // Approximate from weighted_avg_watts of long efforts.
  const wattCandidates = dropOutliers(
    last12w
      .filter(
        (a) =>
          a.movingTimeSec >= 20 * 60 &&
          (a.weightedAvgWatts ?? a.averageWatts ?? 0) > 0,
      )
      .map((a) => a.weightedAvgWatts ?? a.averageWatts ?? 0),
  );
  const estimatedFtpW =
    wattCandidates.length > 0 ? Math.round(Math.max(...wattCandidates) * 0.95) : undefined;

  return {
    weeklyVolumeM: median([...weekTotals.values()]),
    weeklyHours: median([...weekHours.values()]),
    longestRideM,
    estimatedFtpW,
    fourWeekActivityCount: last4w.length,
  };
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${week.toString().padStart(2, "0")}`;
}
