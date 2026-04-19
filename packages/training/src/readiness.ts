/**
 * Daily-readiness guardrails (G2).
 *
 * Computes a deterministic readiness level from check-in + rolling RHR + TSB.
 * The Daily Adjustment Agent receives this level and must pick from a fixed
 * action enum — it cannot invent intensity.
 */

export type ReadinessLevel = "green" | "amber" | "red";
export type AdjustmentAction =
  | "keep"
  | "reduce_intensity"
  | "swap_z2"
  | "rest"
  | "forced_deload"
  | "injured_pause";

export interface CheckIn {
  readiness: number; // 1-10
  sleepHours?: number;
  sleepQuality?: number; // 1-5
  restingHr?: number;
  soreness?: number; // 1-5
  injured: boolean;
  sick: boolean;
}

export interface ReadinessContext {
  /** Mean RHR over the user's last 14 daily check-ins. */
  rhr14dAvg?: number;
  /** Today's TSB (Training Stress Balance). */
  tsb?: number;
  /** Number of consecutive days TSB has been below -25. */
  tsbBelowThresholdDays?: number;
}

export interface ReadinessAssessment {
  level: ReadinessLevel;
  action: AdjustmentAction;
  reasons: string[];
  /** Allowed actions an LLM can choose between for this level. */
  allowedActions: AdjustmentAction[];
}

export const READINESS_THRESHOLDS = {
  RHR_ELEVATED_AMBER: 3, // bpm above 14d avg
  RHR_ELEVATED_RED: 7,
  SLEEP_RED_HOURS: 5,
  SLEEP_AMBER_HOURS: 6,
  READINESS_RED_MAX: 3,
  READINESS_AMBER_MAX: 6,
  TSB_FORCED_DELOAD: -25,
  TSB_FORCED_DELOAD_DAYS: 3,
} as const;

export function assessReadiness(
  ci: CheckIn,
  ctx: ReadinessContext = {},
): ReadinessAssessment {
  const reasons: string[] = [];

  // Hard stop: injured or sick
  if (ci.injured || ci.sick) {
    return {
      level: "red",
      action: "injured_pause",
      reasons: [ci.injured ? "User flagged injury." : "User flagged illness."],
      allowedActions: ["injured_pause"],
    };
  }

  // Forced deload from chronic overload
  if (
    ctx.tsb !== undefined &&
    ctx.tsb < READINESS_THRESHOLDS.TSB_FORCED_DELOAD &&
    (ctx.tsbBelowThresholdDays ?? 0) >= READINESS_THRESHOLDS.TSB_FORCED_DELOAD_DAYS
  ) {
    return {
      level: "red",
      action: "forced_deload",
      reasons: [
        `TSB ${ctx.tsb.toFixed(1)} below ${READINESS_THRESHOLDS.TSB_FORCED_DELOAD} for ≥${READINESS_THRESHOLDS.TSB_FORCED_DELOAD_DAYS} days.`,
      ],
      allowedActions: ["forced_deload", "rest"],
    };
  }

  let level: ReadinessLevel = "green";

  if (ci.readiness <= READINESS_THRESHOLDS.READINESS_RED_MAX) {
    level = "red";
    reasons.push(`Readiness ${ci.readiness}/10.`);
  } else if (ci.readiness <= READINESS_THRESHOLDS.READINESS_AMBER_MAX) {
    level = "amber";
    reasons.push(`Readiness ${ci.readiness}/10.`);
  }

  if (ci.sleepHours !== undefined) {
    if (ci.sleepHours < READINESS_THRESHOLDS.SLEEP_RED_HOURS) {
      level = "red";
      reasons.push(`Sleep ${ci.sleepHours.toFixed(1)}h.`);
    } else if (ci.sleepHours < READINESS_THRESHOLDS.SLEEP_AMBER_HOURS && level === "green") {
      level = "amber";
      reasons.push(`Sleep ${ci.sleepHours.toFixed(1)}h.`);
    }
  }

  if (ci.restingHr !== undefined && ctx.rhr14dAvg !== undefined) {
    const delta = ci.restingHr - ctx.rhr14dAvg;
    if (delta > READINESS_THRESHOLDS.RHR_ELEVATED_RED) {
      level = "red";
      reasons.push(`RHR +${delta.toFixed(0)} bpm vs 14d avg.`);
    } else if (delta > READINESS_THRESHOLDS.RHR_ELEVATED_AMBER && level !== "red") {
      level = "amber";
      reasons.push(`RHR +${delta.toFixed(0)} bpm vs 14d avg.`);
    }
  }

  const allowedByLevel: Record<ReadinessLevel, AdjustmentAction[]> = {
    green: ["keep"],
    amber: ["reduce_intensity", "swap_z2"],
    red: ["swap_z2", "rest"],
  };

  return {
    level,
    action: allowedByLevel[level][0]!,
    reasons,
    allowedActions: allowedByLevel[level],
  };
}
