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

/**
 * Compact "X ago" formatter. Server-safe (no Intl.RelativeTimeFormat locale drift):
 * returns "just now", "5m ago", "3h ago", "2d ago", "3w ago".
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const sec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 8) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

/**
 * Tailwind palette per sport. Returns { bg, text, ring, accent } classes plus a hex
 * accent for SVG fills. Keep palette consistent across pages.
 */
const SPORT_PALETTE: Record<
  string,
  { bg: string; text: string; ring: string; hex: string; emoji: string }
> = {
  Run: { bg: "bg-orange-100", text: "text-orange-800", ring: "ring-orange-200", hex: "#f97316", emoji: "🏃" },
  TrailRun: { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200", hex: "#d97706", emoji: "⛰️" },
  VirtualRun: { bg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200", hex: "#fb923c", emoji: "🏃" },
  Ride: { bg: "bg-sky-100", text: "text-sky-800", ring: "ring-sky-200", hex: "#0284c7", emoji: "🚴" },
  VirtualRide: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200", hex: "#38bdf8", emoji: "🚴" },
  MountainBikeRide: { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200", hex: "#059669", emoji: "🚵" },
  GravelRide: { bg: "bg-lime-100", text: "text-lime-800", ring: "ring-lime-200", hex: "#65a30d", emoji: "🚴" },
  Walk: { bg: "bg-neutral-100", text: "text-neutral-700", ring: "ring-neutral-200", hex: "#737373", emoji: "🚶" },
  Hike: { bg: "bg-stone-100", text: "text-stone-800", ring: "ring-stone-200", hex: "#78716c", emoji: "🥾" },
  Swim: { bg: "bg-cyan-100", text: "text-cyan-800", ring: "ring-cyan-200", hex: "#0891b2", emoji: "🏊" },
  Workout: { bg: "bg-violet-100", text: "text-violet-800", ring: "ring-violet-200", hex: "#7c3aed", emoji: "💪" },
  WeightTraining: { bg: "bg-purple-100", text: "text-purple-800", ring: "ring-purple-200", hex: "#9333ea", emoji: "🏋️" },
  HighIntensityIntervalTraining: { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-200", hex: "#e11d48", emoji: "🔥" },
  Yoga: { bg: "bg-indigo-100", text: "text-indigo-800", ring: "ring-indigo-200", hex: "#4f46e5", emoji: "🧘" },
  Rowing: { bg: "bg-teal-100", text: "text-teal-800", ring: "ring-teal-200", hex: "#0d9488", emoji: "🚣" },
};

export function sportStyle(sportType: string) {
  return (
    SPORT_PALETTE[sportType] ?? {
      bg: "bg-neutral-100",
      text: "text-neutral-700",
      ring: "ring-neutral-200",
      hex: "#a3a3a3",
      emoji: "•",
    }
  );
}

/** Short display name for a Strava sportType (e.g. "HIIT" instead of "HighIntensityIntervalTraining"). */
const SPORT_LABEL: Record<string, string> = {
  HighIntensityIntervalTraining: "HIIT",
  MountainBikeRide: "MTB",
  VirtualRide: "Virtual ride",
  VirtualRun: "Virtual run",
  TrailRun: "Trail run",
  GravelRide: "Gravel",
  WeightTraining: "Weights",
  EBikeRide: "E-bike",
  EMountainBikeRide: "E-MTB",
};

export function sportLabel(sportType: string): string {
  return SPORT_LABEL[sportType] ?? sportType;
}
