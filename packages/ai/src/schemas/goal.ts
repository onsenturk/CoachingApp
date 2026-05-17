/**
 * Zod schema for the goal payload posted to `/api/program/generate`.
 *
 * Used by both the goal-capture form and the API route.
 */

import { z } from "zod";

export const GoalTypeSchema = z.enum([
  "5k",
  "10k",
  "half",
  "marathon",
  "custom",
]);
export type GoalType = z.infer<typeof GoalTypeSchema>;

export const ProgramIntensitySchema = z.enum([
  "easy",
  "moderate",
  "aggressive",
]);
export type ProgramIntensity = z.infer<typeof ProgramIntensitySchema>;

export const GoalInputSchema = z
  .object({
    goalType: GoalTypeSchema,
    /** Race distance in metres. For preset goalTypes this matches the standard. */
    distanceM: z.number().positive().max(100_000),
    /** Optional finishing-time target in seconds. Legacy clients may still send this. */
    targetTimeSec: z
      .number()
      .int()
      .positive()
      .max(20 * 3600)
      .optional(),
    /** ISO yyyy-mm-dd of the race day. If omitted, the plan ends after weeksTotal. */
    goalDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    weeksTotal: z.number().int().min(4).max(16),
    sessionsPerWk: z.number().int().min(3).max(7),
    /** Controls how ambitious target paces should be relative to current prediction. */
    programIntensity: ProgramIntensitySchema.default("moderate"),
    /** Hard-coded "run" for v1. */
    sport: z.literal("run"),
    /** Legacy pre-draft replacement flag. Draft acceptance now controls activation. */
    replaceActiveProgram: z.boolean().optional().default(false),
  })
  .refine(
    (v) =>
      !v.goalDate || new Date(v.goalDate).getTime() > Date.now() - 86_400_000,
    {
      message: "Goal date must not be in the past.",
      path: ["goalDate"],
    },
  );

export type GoalInput = z.infer<typeof GoalInputSchema>;

export const PRESET_DISTANCES_M: Record<Exclude<GoalType, "custom">, number> = {
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097.5,
  marathon: 42_195,
};
