/**
 * Zod schema for the goal payload posted to `/api/program/generate`.
 *
 * Used by both the goal-capture form and the API route.
 */

import { z } from "zod";

export const GoalTypeSchema = z.enum(["5k", "10k", "half", "marathon", "custom"]);
export type GoalType = z.infer<typeof GoalTypeSchema>;

export const GoalInputSchema = z
  .object({
    goalType: GoalTypeSchema,
    /** Race distance in metres. For preset goalTypes this matches the standard. */
    distanceM: z.number().positive().max(100_000),
    /** Optional finishing-time target in seconds. Omit for "just complete the distance". */
    targetTimeSec: z.number().int().positive().max(20 * 3600).optional(),
    /** ISO yyyy-mm-dd of the race day. Plan will end on this date. */
    goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weeksTotal: z.number().int().min(4).max(16),
    sessionsPerWk: z.number().int().min(3).max(7),
    /** Hard-coded "run" for v1. */
    sport: z.literal("run"),
    /** Required when replacing an existing active program. */
    replaceActiveProgram: z.boolean().optional().default(false),
  })
  .refine((v) => new Date(v.goalDate).getTime() > Date.now() - 86_400_000, {
    message: "Goal date must not be in the past.",
    path: ["goalDate"],
  });

export type GoalInput = z.infer<typeof GoalInputSchema>;

export const PRESET_DISTANCES_M: Record<Exclude<GoalType, "custom">, number> = {
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097.5,
  marathon: 42_195,
};
