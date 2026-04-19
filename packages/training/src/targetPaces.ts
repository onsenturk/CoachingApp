/**
 * Goal → target paces (running).
 */

export interface RaceTargets {
  goalPaceSecPerKm: number;
  thresholdPaceSecPerKm: number; // ~half-marathon pace
  marathonPaceSecPerKm: number;
  vo2PaceSecPerKm: number; // ~5K pace
  easyPaceSecPerKm: number;
}

export const RACE_DISTANCES_M = {
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097.5,
  marathon: 42_195,
} as const;

/** Daniels-style derivation: estimate paces around a target race pace. */
export function targetsFromGoal(
  goalDistanceM: number,
  goalTimeSec: number,
): RaceTargets {
  const goalPaceSecPerKm = goalTimeSec / (goalDistanceM / 1000);
  // Simple approximations; refine later with Riegel + VDOT.
  const ratio = goalDistanceM / RACE_DISTANCES_M.half;
  let thresholdPaceSecPerKm: number;
  if (ratio >= 1.5) {
    // Marathon goal — threshold faster than goal pace
    thresholdPaceSecPerKm = goalPaceSecPerKm * 0.94;
  } else if (ratio >= 0.9) {
    // Half goal — threshold ≈ goal pace
    thresholdPaceSecPerKm = goalPaceSecPerKm * 0.99;
  } else if (ratio >= 0.4) {
    // 10K goal — threshold slower than goal pace
    thresholdPaceSecPerKm = goalPaceSecPerKm * 1.04;
  } else {
    // 5K goal
    thresholdPaceSecPerKm = goalPaceSecPerKm * 1.06;
  }
  return {
    goalPaceSecPerKm,
    thresholdPaceSecPerKm,
    marathonPaceSecPerKm: thresholdPaceSecPerKm * 1.06,
    vo2PaceSecPerKm: thresholdPaceSecPerKm * 0.94,
    easyPaceSecPerKm: thresholdPaceSecPerKm * 1.25,
  };
}

/** Format `seconds-per-km` as `M:SS/km`. */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}
