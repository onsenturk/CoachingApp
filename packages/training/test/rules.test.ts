import { describe, it, expect } from "vitest";
import { validatePlan, checkFeasibility, type PlanCandidate } from "../src/rules.js";

const baseSession = {
  date: "2026-04-19",
  workoutType: "easy" as const,
  isHard: false,
  durationMin: 45,
  distanceM: 8000,
};

function week(weekIndex: number, sessions: Partial<(typeof baseSession & { dayOfWeek: number; weekIndex: number; workoutType: any; isHard: boolean })>[]) {
  return sessions.map((s, i) => ({
    ...baseSession,
    weekIndex,
    dayOfWeek: i + 1,
    ...s,
  }));
}

describe("validatePlan", () => {
  it("flags back-to-back hard days", () => {
    const plan: PlanCandidate = {
      weeksTotal: 1,
      sessionsPerWk: 3,
      sessions: week(1, [
        { workoutType: "interval", isHard: true, dayOfWeek: 2 },
        { workoutType: "tempo", isHard: true, dayOfWeek: 3 },
        { workoutType: "rest", isHard: false, dayOfWeek: 7, distanceM: 0 },
      ]),
    };
    const r = validatePlan(plan);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.code === "BACK_TO_BACK_HARD")).toBe(true);
  });

  it("flags missing rest day", () => {
    const plan: PlanCandidate = {
      weeksTotal: 1,
      sessionsPerWk: 7,
      sessions: Array.from({ length: 7 }, (_, i) => ({
        ...baseSession,
        weekIndex: 1,
        dayOfWeek: i + 1,
        workoutType: "easy" as const,
        isHard: false,
      })),
    };
    const r = validatePlan(plan);
    expect(r.violations.some((v) => v.code === "INSUFFICIENT_REST")).toBe(true);
  });

  it("flags long run > 35% of weekly volume", () => {
    const plan: PlanCandidate = {
      weeksTotal: 1,
      sessionsPerWk: 2,
      sessions: [
        { ...baseSession, weekIndex: 1, dayOfWeek: 7, workoutType: "long", distanceM: 20000 },
        { ...baseSession, weekIndex: 1, dayOfWeek: 1, workoutType: "rest", distanceM: 0 },
      ],
    };
    const r = validatePlan(plan);
    expect(r.violations.some((v) => v.code === "LONG_RUN_TOO_BIG")).toBe(true);
  });
});

describe("checkFeasibility", () => {
  it("flags sub-2h half off slow baseline + short timeline as red", () => {
    // Current threshold ~ 6:30/km, target 5:41/km, 8 weeks
    const f = checkFeasibility({
      goalType: "half",
      goalDistanceM: 21097.5,
      goalTimeSec: 7200, // 2:00:00
      weeksUntilRace: 8,
      currentThresholdPaceSecPerKm: 390, // 6:30/km
      currentLongestM: 12000,
      currentWeeklyVolumeM: 25000,
    });
    expect(f.feasibility).toBe("red");
    expect(f.suggestedAlternativeTimeSec).toBeGreaterThan(7200);
  });

  it("returns green when goal is within reach", () => {
    const f = checkFeasibility({
      goalType: "half",
      goalDistanceM: 21097.5,
      goalTimeSec: 7200,
      weeksUntilRace: 16,
      currentThresholdPaceSecPerKm: 350, // 5:50/km
      currentLongestM: 19000,
      currentWeeklyVolumeM: 50000,
    });
    expect(f.feasibility).toBe("green");
  });
});
