/**
 * Helpers to render Strava activities consistently across pages.
 *
 * Calorie estimation order:
 *   1. `rawJson.calories` — present when Strava returned it (detail endpoint, some sports).
 *   2. `kilojoules` — for cycling, ~1 kJ ≈ 1 kcal because human efficiency is ~25%
 *      (work output 1 kJ × 1/0.25 = 4 kJ chemical input ≈ 1 kcal output... actually
 *      4 kJ chemical = ~1 kcal, but the standard Strava convention treats kJ ≈ kcal).
 *   3. Sport-based MET estimate from moving time (and distance for running).
 */

type ActivityLike = {
  sportType: string;
  movingTime: number; // seconds
  distance: number; // meters
  averageHr?: number | null;
  kilojoules?: number | null;
  rawJson?: unknown;
};

const MET_BY_SPORT: Record<string, number> = {
  Run: 9.8,
  TrailRun: 10.0,
  VirtualRun: 9.0,
  Ride: 7.5,
  VirtualRide: 7.0,
  MountainBikeRide: 8.5,
  GravelRide: 8.0,
  Walk: 3.5,
  Hike: 6.0,
  Swim: 7.0,
  Workout: 5.0,
  WeightTraining: 4.5,
  HighIntensityIntervalTraining: 9.0,
  Yoga: 2.5,
  Rowing: 7.0,
};

export function estimateCalories(a: ActivityLike, weightKg: number = 75): number {
  // 1) explicit value from Strava
  const raw = a.rawJson as { calories?: number } | undefined;
  if (raw && typeof raw.calories === "number" && raw.calories > 0) {
    return Math.round(raw.calories);
  }
  // 2) kilojoules (cycling work)
  if (a.kilojoules && a.kilojoules > 0) {
    return Math.round(a.kilojoules);
  }
  // 3) MET estimate: kcal = MET × weight(kg) × hours
  const met = MET_BY_SPORT[a.sportType] ?? 5.0;
  const hours = a.movingTime / 3600;
  return Math.round(met * weightKg * hours);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}min`;
}

export function formatDistance(meters: number): string {
  if (meters < 100) return "—";
  return `${(meters / 1000).toFixed(1)} km`;
}
