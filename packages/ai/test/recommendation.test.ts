import { describe, expect, it } from "vitest";
import { WorkoutRecommendationOutputSchema } from "../src/schemas/recommendation.js";

describe("WorkoutRecommendationOutputSchema", () => {
  it("accepts a valid agent recommendation", () => {
    const parsed = WorkoutRecommendationOutputSchema.parse({
      sport: "run",
      durationBucket: "20to40",
      effort: "moderate",
      durationMin: 30,
      workoutType: "steady",
      description: "30 min steady run with a controlled middle section.",
      reasons: ["Past 7 days show room for controlled aerobic work."],
      confidence: 0.74,
    });

    expect(parsed.sport).toBe("run");
  });

  it("rejects unsupported enum values", () => {
    expect(() =>
      WorkoutRecommendationOutputSchema.parse({
        sport: "swim",
        durationBucket: "20to40",
        effort: "moderate",
        durationMin: 30,
        workoutType: "steady",
        description: "30 min steady swim.",
        reasons: ["Bad sport."],
        confidence: 0.5,
      }),
    ).toThrow();
  });
});
