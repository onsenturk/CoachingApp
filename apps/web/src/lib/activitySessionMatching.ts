import { isRideSport, isRunSport } from "@/lib/activityMetrics";

export type MatchActivity = {
  id: bigint;
  sportType: string;
  startDateLocal: Date;
  distance: number;
  movingTime: number;
};

export type MatchSession = {
  id: string;
  date: Date;
  sport: string;
  workoutType: string;
  durationMin: number | null;
  distanceM: number | null;
};

type MatchResult = {
  activity: MatchActivity;
  score: number;
};

export function sameLocalDate(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

export function isCompatibleSport(
  session: MatchSession,
  activity: MatchActivity,
): boolean {
  const plannedSport = session.sport.toLowerCase();
  const workoutType = session.workoutType.toLowerCase();

  if (workoutType === "rest" || workoutType.includes("strength")) return false;
  if (plannedSport === "run" || workoutType.includes("run"))
    return isRunSport(activity.sportType);
  if (
    plannedSport === "bike" ||
    plannedSport === "ride" ||
    workoutType.includes("bike")
  ) {
    return isRideSport(activity.sportType);
  }
  if (plannedSport === "both")
    return isRunSport(activity.sportType) || isRideSport(activity.sportType);
  return isRunSport(activity.sportType) || isRideSport(activity.sportType);
}

export function findBestActivityMatch(
  session: MatchSession,
  activities: MatchActivity[],
): MatchResult | null {
  const scored = activities
    .filter((activity) => sameLocalDate(session.date, activity.startDateLocal))
    .filter((activity) => isCompatibleSport(session, activity))
    .map((activity) => ({
      activity,
      score: scoreActivityMatch(session, activity),
    }))
    .filter((result) => result.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

export function scoreActivityMatch(
  session: MatchSession,
  activity: MatchActivity,
): number {
  let score = 0.35;

  if (session.distanceM && session.distanceM > 0 && activity.distance > 0) {
    score += proximityScore(session.distanceM, activity.distance) * 0.4;
  }

  if (
    session.durationMin &&
    session.durationMin > 0 &&
    activity.movingTime > 0
  ) {
    score +=
      proximityScore(session.durationMin * 60, activity.movingTime) * 0.25;
  }

  if (!session.distanceM && !session.durationMin) score += 0.15;
  return Math.min(1, score);
}

function proximityScore(expected: number, actual: number): number {
  const ratio = Math.abs(actual - expected) / expected;
  if (ratio <= 0.15) return 1;
  if (ratio <= 0.35) return 0.7;
  if (ratio <= 0.6) return 0.35;
  return 0;
}
