/**
 * Banister TRIMP (Training Impulse).
 * TRIMP = duration_min * HRr * 0.64 * exp(b * HRr)
 *   HRr = (HR_avg - HR_rest) / (HR_max - HR_rest)
 *   b = 1.92 (men), 1.67 (women)
 */

export interface TrimpInput {
  durationSec: number;
  averageHr: number;
  restingHr: number;
  maxHr: number;
  sex?: "M" | "F";
}

export function trimpBanister({
  durationSec,
  averageHr,
  restingHr,
  maxHr,
  sex = "M",
}: TrimpInput): number {
  if (maxHr <= restingHr || averageHr <= 0) return 0;
  const hrr = Math.min(1, Math.max(0, (averageHr - restingHr) / (maxHr - restingHr)));
  const b = sex === "F" ? 1.67 : 1.92;
  const minutes = durationSec / 60;
  return minutes * hrr * 0.64 * Math.exp(b * hrr);
}

/**
 * Pace-based TRIMP fallback when HR is missing (running only).
 * Uses zone weighting: Z1=1, Z2=2, Z3=3, Z4=4, Z5=5 minutes-equivalent multiplier.
 */
export function trimpFromPace(
  zoneSeconds: { z1: number; z2: number; z3: number; z4: number; z5: number },
): number {
  const w = [1, 2, 3, 4, 5];
  const sec = [zoneSeconds.z1, zoneSeconds.z2, zoneSeconds.z3, zoneSeconds.z4, zoneSeconds.z5];
  return sec.reduce((sum, s, i) => sum + (s / 60) * w[i]!, 0);
}
