/**
 * Zod schema for Daily Adjustment agent output.
 * Action enum is fixed — agent cannot invent intensity.
 */

import { z } from "zod";

export const AdjustmentActionSchema = z.enum([
  "keep",
  "reduce_intensity",
  "swap_z2",
  "rest",
  "forced_deload",
  "injured_pause",
]);

export const AdjustmentOutputSchema = z.object({
  action: AdjustmentActionSchema,
  reason: z.string().min(1).max(500),
  newDescription: z.string().max(500).optional(),
  newDurationMin: z.number().int().positive().optional(),
  newTargetZone: z.enum(["z1", "z2", "z3", "z4", "z5"]).optional(),
});
export type AdjustmentOutput = z.infer<typeof AdjustmentOutputSchema>;
