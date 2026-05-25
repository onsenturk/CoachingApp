export const RECOMMENDATION_WINDOW_DAYS = 7;

export const RECOMMENDATION_SPORTS = ["run", "bike"] as const;
export const RECOMMENDATION_DURATION_BUCKETS = [
  "under20",
  "20to40",
  "over40",
] as const;
export const RECOMMENDATION_EFFORTS = ["easy", "moderate", "hard"] as const;

export type RecommendationSport = (typeof RECOMMENDATION_SPORTS)[number];
export type RecommendationDurationBucket =
  (typeof RECOMMENDATION_DURATION_BUCKETS)[number];
export type RecommendationEffort = (typeof RECOMMENDATION_EFFORTS)[number];
export type RecommendationSource = "agent";
export type WorkoutRecommendationType =
  | "rest"
  | "recovery"
  | "easy"
  | "steady"
  | "tempo"
  | "interval";

export interface RecommendationActivity {
  sportType: string;
  startDate: Date | string;
  movingTimeSec: number;
  distanceM?: number | null;
  tss?: number | null;
  trimp?: number | null;
  intensityFactor?: number | null;
}

export interface RecommendationPreferences {
  sport?: RecommendationSport;
  durationBucket?: RecommendationDurationBucket;
  effort?: RecommendationEffort;
}

export interface EffortWindowPattern {
  windowDays: number;
  startDate: string;
  endDate: string;
  effortCount: number;
  totalDurationMin: number;
  totalDistanceM: number;
  sportCounts: Record<RecommendationSport, number>;
  sportDurationMin: Record<RecommendationSport, number>;
  averageDurationMinBySport: Record<RecommendationSport, number | null>;
  hardEffortCount: number;
  hardEffortWithin48h: boolean;
  consecutiveTrainingDays: number;
  daysSinceLastRest: number | null;
  latestEffortAt?: string;
  dataConfidence: number;
}

export interface RecommendationEffortSummary {
  date: string;
  sport: RecommendationSport;
  durationMin: number;
  distanceM: number;
  tss?: number;
  trimp?: number;
  intensityFactor?: number;
  hard: boolean;
}

export interface WorkoutRecommendation {
  sport: RecommendationSport;
  durationBucket: RecommendationDurationBucket;
  requestedDurationBucket: RecommendationDurationBucket;
  effort: RecommendationEffort;
  requestedEffort: RecommendationEffort;
  durationMin: number;
  workoutType: WorkoutRecommendationType;
  description: string;
  reasons: string[];
  confidence: number;
  source: RecommendationSource;
  planContext: "planned-session" | "ad-hoc";
  safetyDowngraded: boolean;
  pattern: EffortWindowPattern;
}

const MS_PER_DAY = 86_400_000;

export function analyzeEffortWindow(
  activities: RecommendationActivity[],
  today: Date | string = new Date(),
  windowDays = RECOMMENDATION_WINDOW_DAYS,
): EffortWindowPattern {
  const now = toDate(today);
  const start = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const relevantActivities = activities
    .map((activity) => ({ ...activity, startDate: toDate(activity.startDate) }))
    .filter(
      (activity) => activity.startDate >= start && activity.startDate <= now,
    )
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

  const sportCounts: Record<RecommendationSport, number> = { run: 0, bike: 0 };
  const sportDurationMin: Record<RecommendationSport, number> = {
    run: 0,
    bike: 0,
  };
  let totalDurationMin = 0;
  let totalDistanceM = 0;
  let hardEffortCount = 0;
  let hardEffortWithin48h = false;
  let loadDataCount = 0;
  const trainingDays = new Set<string>();

  for (const activity of relevantActivities) {
    const sport = mapSportType(activity.sportType);
    if (!sport) continue;

    const durationMin = Math.max(0, activity.movingTimeSec / 60);
    sportCounts[sport] += 1;
    sportDurationMin[sport] += durationMin;
    totalDurationMin += durationMin;
    totalDistanceM += activity.distanceM ?? 0;
    trainingDays.add(dateKey(activity.startDate));

    if (
      activity.tss != null ||
      activity.trimp != null ||
      activity.intensityFactor != null
    ) {
      loadDataCount += 1;
    }

    if (isHardEffort(activity)) {
      hardEffortCount += 1;
      if (now.getTime() - activity.startDate.getTime() <= 2 * MS_PER_DAY) {
        hardEffortWithin48h = true;
      }
    }
  }

  const effortCount = sportCounts.run + sportCounts.bike;

  return {
    windowDays,
    startDate: dateKey(start),
    endDate: dateKey(now),
    effortCount,
    totalDurationMin: round(totalDurationMin),
    totalDistanceM: round(totalDistanceM),
    sportCounts,
    sportDurationMin: {
      run: round(sportDurationMin.run),
      bike: round(sportDurationMin.bike),
    },
    averageDurationMinBySport: {
      run: sportCounts.run
        ? round(sportDurationMin.run / sportCounts.run)
        : null,
      bike: sportCounts.bike
        ? round(sportDurationMin.bike / sportCounts.bike)
        : null,
    },
    hardEffortCount,
    hardEffortWithin48h,
    consecutiveTrainingDays: countConsecutiveTrainingDays(trainingDays, now),
    daysSinceLastRest: countDaysSinceLastRest(trainingDays, now),
    latestEffortAt: relevantActivities[0]?.startDate.toISOString(),
    dataConfidence: computeDataConfidence(effortCount, loadDataCount),
  };
}

export function summarizeEffortsForAgent(
  activities: RecommendationActivity[],
  today: Date | string = new Date(),
  windowDays = RECOMMENDATION_WINDOW_DAYS,
): RecommendationEffortSummary[] {
  const now = toDate(today);
  const start = new Date(now.getTime() - windowDays * MS_PER_DAY);
  return activities
    .map((activity) => ({ ...activity, startDate: toDate(activity.startDate) }))
    .filter(
      (activity) => activity.startDate >= start && activity.startDate <= now,
    )
    .flatMap((activity): RecommendationEffortSummary[] => {
      const sport = mapSportType(activity.sportType);
      if (!sport) return [];
      return [
        {
          date: dateKey(activity.startDate),
          sport,
          durationMin: round(Math.max(0, activity.movingTimeSec / 60)),
          distanceM: round(activity.distanceM ?? 0),
          tss: activity.tss ?? undefined,
          trimp: activity.trimp ?? undefined,
          intensityFactor: activity.intensityFactor ?? undefined,
          hard: isHardEffort(activity),
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function mapSportType(sportType: string): RecommendationSport | null {
  const normalized = sportType.toLowerCase();
  if (normalized.includes("run")) return "run";
  if (
    normalized.includes("ride") ||
    normalized.includes("bike") ||
    normalized.includes("cycling")
  ) {
    return "bike";
  }
  return null;
}

function isHardEffort(activity: RecommendationActivity): boolean {
  const load = activity.tss ?? activity.trimp;
  if (
    typeof activity.intensityFactor === "number" &&
    activity.intensityFactor >= 0.85
  ) {
    return true;
  }
  if (typeof load === "number" && load >= 70) return true;
  return activity.movingTimeSec >= 90 * 60 && (load ?? 0) >= 50;
}

function computeDataConfidence(
  effortCount: number,
  loadDataCount: number,
): number {
  if (effortCount === 0) return 0.25;
  const effortScore = clamp(effortCount / 4, 0.25, 0.65);
  const loadScore = clamp(loadDataCount / effortCount, 0, 1) * 0.25;
  return round(clamp(effortScore + loadScore, 0.25, 0.9));
}

function countConsecutiveTrainingDays(
  trainingDays: Set<string>,
  today: Date,
): number {
  const startOffset = trainingDays.has(dateKey(today)) ? 0 : 1;
  const startDay = new Date(today.getTime() - startOffset * MS_PER_DAY);
  if (!trainingDays.has(dateKey(startDay))) return 0;

  let count = 0;
  for (
    let offset = startOffset;
    offset < RECOMMENDATION_WINDOW_DAYS;
    offset += 1
  ) {
    const day = new Date(today.getTime() - offset * MS_PER_DAY);
    if (!trainingDays.has(dateKey(day))) break;
    count += 1;
  }
  return count;
}

function countDaysSinceLastRest(
  trainingDays: Set<string>,
  today: Date,
): number | null {
  if (trainingDays.size === 0) return null;
  for (let offset = 0; offset < RECOMMENDATION_WINDOW_DAYS; offset += 1) {
    const day = new Date(today.getTime() - offset * MS_PER_DAY);
    if (!trainingDays.has(dateKey(day))) return offset;
  }
  return RECOMMENDATION_WINDOW_DAYS;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
