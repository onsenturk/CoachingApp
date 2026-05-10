/**
 * Race-time predictions from recent best efforts.
 *
 * Method: Pete Riegel's formula —  T2 = T1 * (D2 / D1) ^ 1.06
 * The 1.06 exponent is the empirical "fatigue factor" for trained runners
 * over distances 5K → marathon. Source: Riegel (1981), "Athletic Records
 * and Human Endurance", American Scientist 69(3).
 *
 * We pick the FASTEST recent effort whose distance is reasonably close to
 * each target, then scale. For very-different distances we fall back to a
 * threshold-pace estimate.
 */

export interface RecentEffort {
  /** Distance covered, meters. */
  distanceM: number;
  /** Moving time, seconds. */
  movingTimeSec: number;
  /** Activity start (used to weight recent efforts higher in future versions). */
  startDate: Date;
}

export interface RacePrediction {
  /** Target distance label, e.g. "5K". */
  label: string;
  distanceM: number;
  /** Predicted finishing time, seconds. */
  predictedSec: number;
  /** Pace seconds-per-km. */
  paceSecPerKm: number;
  /** Source of prediction: "best-effort" (Riegel from a real run) or "threshold" (estimated). */
  source: "best-effort" | "threshold";
  /** When the source effort was recorded (only for best-effort). */
  basisDate?: Date;
  /** Original distance + time the prediction was scaled from. */
  basisDistanceM?: number;
  basisTimeSec?: number;
}

const RIEGEL_EXP = 1.06;

const TARGETS: Array<{ label: string; distanceM: number }> = [
  { label: "5K", distanceM: 5_000 },
  { label: "10K", distanceM: 10_000 },
  { label: "Half", distanceM: 21_097.5 },
  { label: "Marathon", distanceM: 42_195 },
];

function riegel(timeSec: number, fromM: number, toM: number, exp = RIEGEL_EXP): number {
  return timeSec * Math.pow(toM / fromM, exp);
}

/**
 * Predict 5K / 10K / HM / Marathon times from recent run history.
 *
 * Strategy per target distance:
 *   1. Filter efforts to last 12 weeks.
 *   2. Pick the effort with the BEST equivalent-time-at-target via Riegel
 *      (i.e. the run that, scaled to the target distance, gives the fastest
 *      predicted time). This naturally handles "ran a fast 5K vs a slower 10K".
 *   3. If no effort exists at all, optionally fall back to threshold pace.
 *
 * Efforts shorter than 1.5km are ignored (warm-ups, intervals, junk).
 */
export function predictRaceTimes(
  efforts: RecentEffort[],
  opts: { thresholdPaceSecPerKm?: number; now?: Date } = {},
): RacePrediction[] {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 12 * 7);

  const recent = efforts.filter(
    (e) =>
      e.startDate >= cutoff &&
      e.distanceM >= 1_500 &&
      e.movingTimeSec > 0 &&
      // Reject impossible paces (faster than 2:30/km — sprint segment, not a run)
      e.movingTimeSec / (e.distanceM / 1000) >= 150,
  );

  const predictions: RacePrediction[] = [];

  for (const { label, distanceM } of TARGETS) {
    let best: { effort: RecentEffort; predicted: number } | null = null;
    for (const eff of recent) {
      // Riegel is most reliable when scaling within ~3x. Skip wild extrapolations
      // (e.g. predicting a marathon from a 1.5K).
      const ratio = distanceM / eff.distanceM;
      if (ratio > 4 || ratio < 0.25) continue;
      const predicted = riegel(eff.movingTimeSec, eff.distanceM, distanceM);
      if (!best || predicted < best.predicted) {
        best = { effort: eff, predicted };
      }
    }

    if (best) {
      predictions.push({
        label,
        distanceM,
        predictedSec: Math.round(best.predicted),
        paceSecPerKm: best.predicted / (distanceM / 1000),
        source: "best-effort" as const,
        basisDate: best.effort.startDate,
        basisDistanceM: best.effort.distanceM,
        basisTimeSec: best.effort.movingTimeSec,
      });
      continue;
    }

    // Fallback: threshold pace ≈ ~1-hour race pace. Riegel from 1h@threshold.
    if (opts.thresholdPaceSecPerKm) {
      const oneHourDistanceM =
        (3600 / opts.thresholdPaceSecPerKm) * 1000; // meters covered in 1h at threshold
      const predicted = riegel(3600, oneHourDistanceM, distanceM);
      predictions.push({
        label,
        distanceM,
        predictedSec: Math.round(predicted),
        paceSecPerKm: predicted / (distanceM / 1000),
        source: "threshold" as const,
      });
    }
  }

  return predictions;
}

export function fmtPredictedTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtPredictedPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
