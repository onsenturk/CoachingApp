/**
 * Zod schema for the Plan Generator agent output.
 * Used to validate Foundry agent JSON before persistence (G3).
 */

import { z } from "zod";

export const WorkoutTypeSchema = z.enum([
  "easy",
  "long",
  "tempo",
  "interval",
  "threshold",
  "recovery",
  "rest",
  "strength",
  "bike-recovery",
]);

export const IntervalSchema = z.object({
  reps: z.number().int().positive(),
  durationSec: z.number().int().nonnegative().optional(),
  distanceM: z.number().nonnegative().optional(),
  targetZone: z.enum(["z1", "z2", "z3", "z4", "z5"]).optional(),
  recoverySec: z.number().int().nonnegative().optional(),
});

export const PlannedSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekIndex: z.number().int().positive(),
  dayOfWeek: z.number().int().min(1).max(7),
  sport: z.enum(["run", "bike"]),
  workoutType: WorkoutTypeSchema,
  durationMin: z.number().int().positive().optional(),
  distanceM: z.number().nonnegative().optional(),
  description: z.string().min(1).max(500),
  isHard: z.boolean(),
  structure: z
    .object({
      warmupMin: z.number().nonnegative().optional(),
      cooldownMin: z.number().nonnegative().optional(),
      intervals: z.array(IntervalSchema).optional(),
      targetPaceSecPerKm: z.number().positive().optional(),
      targetPowerW: z.number().positive().optional(),
    })
    .optional(),
});
export type PlannedSessionOut = z.infer<typeof PlannedSessionSchema>;

export const FeasibilityLevelSchema = z.enum(["green", "amber", "red"]);

export const PlanGeneratorOutputSchema = z.object({
  feasibility: FeasibilityLevelSchema,
  feasibilityReason: z.string().min(1).max(1000),
  suggestedAlternative: z
    .object({
      goalTimeSec: z.number().int().positive().optional(),
      weeksTotal: z.number().int().positive().optional(),
      reason: z.string().max(500).optional(),
    })
    .optional(),
  weeksTotal: z.number().int().min(4).max(24),
  sessionsPerWk: z.number().int().min(2).max(7),
  sessions: z.array(PlannedSessionSchema).min(8),
  notes: z.string().max(2000).optional(),
});
export type PlanGeneratorOutput = z.infer<typeof PlanGeneratorOutputSchema>;
