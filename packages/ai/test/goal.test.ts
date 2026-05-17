import { describe, expect, it } from "vitest";
import { GoalInputSchema } from "../src/schemas/goal.js";

describe("GoalInputSchema", () => {
  const baseGoal = {
    goalType: "half",
    distanceM: 21_097.5,
    weeksTotal: 8,
    sessionsPerWk: 4,
    sport: "run",
  } as const;

  it("allows race day to be omitted and defaults intensity to moderate", () => {
    const parsed = GoalInputSchema.parse(baseGoal);

    expect(parsed.goalDate).toBeUndefined();
    expect(parsed.programIntensity).toBe("moderate");
  });

  it("accepts supported program intensities", () => {
    expect(
      GoalInputSchema.parse({ ...baseGoal, programIntensity: "easy" })
        .programIntensity,
    ).toBe("easy");
    expect(
      GoalInputSchema.parse({ ...baseGoal, programIntensity: "aggressive" })
        .programIntensity,
    ).toBe("aggressive");
  });

  it("rejects unsupported program intensities", () => {
    expect(() =>
      GoalInputSchema.parse({ ...baseGoal, programIntensity: "reckless" }),
    ).toThrow();
  });
});
