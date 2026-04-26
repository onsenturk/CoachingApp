/**
 * Physiological guardrails (G1).
 *
 * These constants and validators are the deterministic rails the Plan Generator
 * agent must satisfy. The agent receives them as JSON `constraints`; we then
 * validate the agent's output and reject/regenerate (max 1 retry) on violation,
 * else fall back to a deterministic rules-based template.
 */

export const RULES = {
  /** Max weekly volume increase vs trailing 4-week average. Classic 10% rule. */
  MAX_WEEKLY_VOLUME_RAMP_PCT: 10,
  /** Polarized distribution: at least this fraction of weekly time in Z1/Z2. */
  MIN_EASY_FRACTION: 0.8,
  /** Polarized distribution: max fraction of weekly time at threshold/VO2. */
  MAX_HARD_FRACTION: 0.2,
  /** Minimum rest or Z1-only days per week. */
  MIN_REST_DAYS_PER_WEEK: 1,
  /** Recovery week cadence: every Nth week is a deload. */
  RECOVERY_WEEK_CADENCE: 4,
  /** Recovery week volume reduction vs prior week. */
  RECOVERY_VOLUME_DROP_PCT: 30,
  /** Taper: last two weeks volume reduction. */
  TAPER_VOLUME_DROPS_PCT: [30, 50] as const,
  /** Long run cap: fraction of total weekly volume. */
  LONG_RUN_MAX_WEEK_FRACTION: 0.35,
  /** Long run absolute cap multiplier vs current longest. */
  LONG_RUN_RAMP_MULTIPLIER: 1.1,
  /** Long-run progression target: % of race distance reached by peak week. */
  LONG_RUN_PROGRESSION_TARGET_PCT: 90,
  /** Goal feasibility: max acceptable required pace improvement vs current threshold. */
  MAX_REQUIRED_PACE_IMPROVEMENT_PCT: 8,
} as const;

export type WorkoutType =
  | "easy"
  | "long"
  | "tempo"
  | "interval"
  | "threshold"
  | "recovery"
  | "rest"
  | "strength"
  | "bike-recovery";

export const HARD_WORKOUT_TYPES: ReadonlySet<WorkoutType> = new Set([
  "tempo",
  "interval",
  "threshold",
]);

export interface PlannedSessionLite {
  date: string; // ISO date
  weekIndex: number;
  dayOfWeek: number; // 1..7 (Mon..Sun)
  workoutType: WorkoutType;
  durationMin?: number;
  distanceM?: number;
  isHard: boolean;
}

export interface PlanCandidate {
  weeksTotal: number;
  sessionsPerWk: number;
  sessions: PlannedSessionLite[];
  goalDistanceM?: number; // race distance
  baselineLongestM?: number;
  baselineWeeklyVolumeM?: number;
}

export interface RuleViolation {
  code: string;
  weekIndex?: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: RuleViolation[];
}

function weeklyTotals(plan: PlanCandidate) {
  const byWeek = new Map<number, { volume: number; hardSessions: number; restDays: number; longestM: number; days: Set<number> }>();
  for (const s of plan.sessions) {
    const w = byWeek.get(s.weekIndex) ?? {
      volume: 0,
      hardSessions: 0,
      restDays: 0,
      longestM: 0,
      days: new Set<number>(),
    };
    w.volume += s.distanceM ?? 0;
    w.days.add(s.dayOfWeek);
    if (s.isHard) w.hardSessions += 1;
    if (s.workoutType === "rest" || s.workoutType === "recovery" || s.workoutType === "bike-recovery") {
      w.restDays += 1;
    }
    if (s.workoutType === "long" && (s.distanceM ?? 0) > w.longestM) {
      w.longestM = s.distanceM ?? 0;
    }
    byWeek.set(s.weekIndex, w);
  }
  return byWeek;
}

/** Validate a candidate plan against G1 physiological rules. */
export function validatePlan(plan: PlanCandidate): ValidationResult {
  const violations: RuleViolation[] = [];
  const totals = weeklyTotals(plan);
  const sortedWeeks = [...totals.keys()].sort((a, b) => a - b);

  // Adaptive long-run cap: lower-frequency plans naturally concentrate volume in
  // the long run, so a strict 35% cap forces unrealistic structures.
  //   ≤3 sessions/wk → 50%, 4 → 42%, 5+ → 35% (configured default).
  const longRunCap =
    plan.sessionsPerWk <= 3
      ? 0.5
      : plan.sessionsPerWk === 4
        ? 0.42
        : RULES.LONG_RUN_MAX_WEEK_FRACTION;

  // Volume ramp ≤ 10% vs trailing 4-week average. When the plan has fewer than
  // 4 prior weeks, seed the average with `baselineWeeklyVolumeM` so the very
  // first ramp weeks are compared against the runner's actual baseline rather
  // than against tiny early-plan numbers.
  for (let i = 0; i < sortedWeeks.length; i++) {
    const wk = sortedWeeks[i]!;
    const cur = totals.get(wk)!.volume;
    const trailing = sortedWeeks
      .slice(Math.max(0, i - 4), i)
      .map((w) => totals.get(w)!.volume);
    while (trailing.length < 4 && plan.baselineWeeklyVolumeM && plan.baselineWeeklyVolumeM > 0) {
      trailing.unshift(plan.baselineWeeklyVolumeM);
    }
    if (trailing.length === 0) continue;
    const avg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
    if (avg > 0 && (cur - avg) / avg > RULES.MAX_WEEKLY_VOLUME_RAMP_PCT / 100) {
      violations.push({
        code: "VOLUME_RAMP_EXCEEDED",
        weekIndex: wk,
        message: `Week ${wk} volume up ${(((cur - avg) / avg) * 100).toFixed(1)}% vs 4-week avg (max ${RULES.MAX_WEEKLY_VOLUME_RAMP_PCT}%).`,
      });
    }
  }

  // Min rest days per week & no back-to-back hard days
  for (const [wk, w] of totals) {
    if (w.restDays < RULES.MIN_REST_DAYS_PER_WEEK) {
      violations.push({
        code: "INSUFFICIENT_REST",
        weekIndex: wk,
        message: `Week ${wk} has ${w.restDays} rest/recovery day(s); need ≥ ${RULES.MIN_REST_DAYS_PER_WEEK}.`,
      });
    }
    // back-to-back hard
    const hardDays = plan.sessions
      .filter((s) => s.weekIndex === wk && s.isHard)
      .map((s) => s.dayOfWeek)
      .sort((a, b) => a - b);
    for (let i = 1; i < hardDays.length; i++) {
      if (hardDays[i]! - hardDays[i - 1]! === 1) {
        violations.push({
          code: "BACK_TO_BACK_HARD",
          weekIndex: wk,
          message: `Week ${wk} has back-to-back hard sessions on days ${hardDays[i - 1]} and ${hardDays[i]}.`,
        });
        break;
      }
    }
  }

  // Long-run cap
  for (const [wk, w] of totals) {
    if (w.longestM > 0 && w.volume > 0) {
      const frac = w.longestM / w.volume;
      if (frac > longRunCap) {
        violations.push({
          code: "LONG_RUN_TOO_BIG",
          weekIndex: wk,
          message: `Week ${wk} long run ${(frac * 100).toFixed(0)}% of weekly volume (max ${(longRunCap * 100).toFixed(0)}%).`,
        });
      }
    }
    if (
      plan.baselineLongestM &&
      w.longestM > plan.baselineLongestM * RULES.LONG_RUN_RAMP_MULTIPLIER
    ) {
      violations.push({
        code: "LONG_RUN_RAMP_EXCEEDED",
        weekIndex: wk,
        message: `Week ${wk} long run ${w.longestM.toFixed(0)}m exceeds ${RULES.LONG_RUN_RAMP_MULTIPLIER}× baseline (${plan.baselineLongestM.toFixed(0)}m).`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export interface FeasibilityInput {
  goalType: string;
  goalDistanceM: number;
  goalTimeSec: number;
  weeksUntilRace: number;
  currentThresholdPaceSecPerKm: number; // running
  currentLongestM: number;
  currentWeeklyVolumeM: number;
}

export type FeasibilityLevel = "green" | "amber" | "red";

export interface FeasibilityResult {
  feasibility: FeasibilityLevel;
  reason: string;
  requiredPaceSecPerKm: number;
  requiredImprovementPct: number;
  suggestedAlternativeTimeSec?: number;
  suggestedAlternativeWeeks?: number;
}

/** G1 goal feasibility check. Surface to user before persisting plan. */
export function checkFeasibility(input: FeasibilityInput): FeasibilityResult {
  const requiredPaceSecPerKm = input.goalTimeSec / (input.goalDistanceM / 1000);
  const improvementPct =
    ((input.currentThresholdPaceSecPerKm - requiredPaceSecPerKm) /
      input.currentThresholdPaceSecPerKm) *
    100;

  const reasons: string[] = [];
  let level: FeasibilityLevel = "green";

  if (improvementPct > RULES.MAX_REQUIRED_PACE_IMPROVEMENT_PCT) {
    level = "red";
    reasons.push(
      `Required pace improvement ${improvementPct.toFixed(1)}% exceeds ${RULES.MAX_REQUIRED_PACE_IMPROVEMENT_PCT}% safe threshold.`,
    );
  } else if (improvementPct > RULES.MAX_REQUIRED_PACE_IMPROVEMENT_PCT * 0.6) {
    level = "amber";
    reasons.push(`Aggressive pace improvement (${improvementPct.toFixed(1)}%).`);
  }

  // Long-run distance capacity: need to reach 90% of race distance.
  const requiredLongRunM = input.goalDistanceM * (RULES.LONG_RUN_PROGRESSION_TARGET_PCT / 100);
  const longRunWeeksNeeded =
    input.currentLongestM > 0
      ? Math.ceil(
          Math.log(requiredLongRunM / input.currentLongestM) /
            Math.log(RULES.LONG_RUN_RAMP_MULTIPLIER),
        )
      : Infinity;
  if (longRunWeeksNeeded > input.weeksUntilRace - 2) {
    level = "red";
    reasons.push(
      `Need ~${longRunWeeksNeeded} weeks to safely build long run from ${(input.currentLongestM / 1000).toFixed(1)}km to ${(requiredLongRunM / 1000).toFixed(1)}km; only ${input.weeksUntilRace} weeks available.`,
    );
  }

  const suggested: Partial<FeasibilityResult> = {};
  if (level === "red") {
    // Suggest a pace ~5% faster than current threshold (achievable in 8-12 weeks)
    const safeRequiredPace =
      input.currentThresholdPaceSecPerKm *
      (1 - RULES.MAX_REQUIRED_PACE_IMPROVEMENT_PCT / 200); // ~4% improvement
    suggested.suggestedAlternativeTimeSec = Math.round(
      safeRequiredPace * (input.goalDistanceM / 1000),
    );
    suggested.suggestedAlternativeWeeks = Math.max(input.weeksUntilRace, longRunWeeksNeeded + 2);
  }

  return {
    feasibility: level,
    reason: reasons.join(" ") || "Goal looks feasible given current fitness.",
    requiredPaceSecPerKm,
    requiredImprovementPct: improvementPct,
    ...suggested,
  };
}
