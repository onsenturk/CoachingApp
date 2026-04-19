/**
 * Zod schema for the daily check-in form payload.
 */

import { z } from "zod";

export const CheckInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readiness: z.number().int().min(1).max(10),
  sleepHours: z.number().min(0).max(14).optional(),
  sleepQuality: z.number().int().min(1).max(5).optional(),
  restingHr: z.number().int().min(20).max(140).optional(),
  soreness: z.number().int().min(1).max(5).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  injured: z.boolean().default(false),
  sick: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});
export type CheckInInput = z.infer<typeof CheckInSchema>;
