type ActivityMetricLike = {
  sportType: string;
  distance: number;
  movingTime: number;
  averageSpeed?: number | null;
};

const RUN_SPORTS = new Set(["Run", "TrailRun", "VirtualRun"]);
const RIDE_SPORTS = new Set([
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "EMountainBikeRide",
]);

export function isRunSport(sportType: string): boolean {
  return RUN_SPORTS.has(sportType);
}

export function isRideSport(sportType: string): boolean {
  return RIDE_SPORTS.has(sportType);
}

export function formatPace(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0)
    return "-";
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

export function formatSpeed(kmh: number | null | undefined): string {
  if (!kmh || !Number.isFinite(kmh) || kmh <= 0) return "-";
  return `${kmh.toFixed(1)} km/h`;
}

export function activityPaceSecPerKm(
  activity: ActivityMetricLike,
): number | null {
  if (activity.distance <= 0 || activity.movingTime <= 0) return null;
  return activity.movingTime / (activity.distance / 1000);
}

export function activitySpeedKmh(activity: ActivityMetricLike): number | null {
  if (activity.averageSpeed && activity.averageSpeed > 0)
    return activity.averageSpeed * 3.6;
  if (activity.distance <= 0 || activity.movingTime <= 0) return null;
  return activity.distance / 1000 / (activity.movingTime / 3600);
}
