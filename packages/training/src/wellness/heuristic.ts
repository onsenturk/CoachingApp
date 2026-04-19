/**
 * Heuristic wellness adapter — derives recovery from Strava HR trends + TSB.
 *
 * Used as a fallback when no manual check-in exists for a date.
 */

import type { WellnessAdapter, WellnessReading } from "./adapter.js";

export interface HeuristicAdapterDeps {
  /** TSB at the start of the given date. */
  getTsb: (userId: string, date: Date) => Promise<number | null>;
  /** 14-day RHR moving average from check-ins. */
  getRhrAvg: (userId: string, date: Date) => Promise<number | null>;
}

export class HeuristicWellnessAdapter implements WellnessAdapter {
  readonly source = "heuristic" as const;
  constructor(private readonly deps: HeuristicAdapterDeps) {}

  async getReading(userId: string, date: Date): Promise<WellnessReading | null> {
    const tsb = await this.deps.getTsb(userId, date);
    const rhr = await this.deps.getRhrAvg(userId, date);
    if (tsb === null) return null;
    // Map TSB to recovery: +25 → 100, 0 → 60, -25 → 20, below → 10.
    let recovery: number;
    if (tsb >= 25) recovery = 100;
    else if (tsb >= 0) recovery = 60 + (tsb / 25) * 40;
    else if (tsb >= -25) recovery = 20 + ((tsb + 25) / 25) * 40;
    else recovery = Math.max(0, 20 + (tsb + 25) * 0.5);
    return {
      date: date.toISOString().slice(0, 10),
      source: this.source,
      recovery: Math.round(recovery),
      restingHr: rhr ?? undefined,
    };
  }
}
