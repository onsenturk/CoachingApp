import { z } from "zod";

export const RecommendationSportSchema = z.enum(["run", "bike"]);
export const RecommendationDurationBucketSchema = z.enum([
  "under20",
  "20to40",
  "over40",
]);
export const RecommendationEffortSchema = z.enum(["easy", "moderate", "hard"]);
export const RecommendationWorkoutTypeSchema = z.enum([
  "rest",
  "recovery",
  "easy",
  "steady",
  "tempo",
  "interval",
]);

export const WorkoutRecommendationOutputSchema = z.object({
  sport: RecommendationSportSchema,
  durationBucket: RecommendationDurationBucketSchema,
  effort: RecommendationEffortSchema,
  durationMin: z.number().int().min(0).max(180),
  workoutType: RecommendationWorkoutTypeSchema,
  description: z.string().min(1).max(500),
  reasons: z.array(z.string().min(1).max(240)).min(1).max(4),
  confidence: z.number().min(0).max(1),
});

export type WorkoutRecommendationOutput = z.infer<
  typeof WorkoutRecommendationOutputSchema
>;
