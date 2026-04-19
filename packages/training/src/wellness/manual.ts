/**
 * Manual wellness adapter — reads from DailyMetric (the user's daily check-in).
 */

import type { WellnessAdapter, WellnessReading } from "./adapter.js";

export interface ManualAdapterDeps {
  /** Find a check-in for the user on the given date. */
  fetchCheckIn: (
    userId: string,
    date: Date,
  ) => Promise<{
    readiness: number;
    sleepHours: number | null;
    sleepQuality: number | null;
    restingHr: number | null;
    soreness: number | null;
  } | null>;
}

export class ManualWellnessAdapter implements WellnessAdapter {
  readonly source = "manual" as const;
  constructor(private readonly deps: ManualAdapterDeps) {}

  async getReading(userId: string, date: Date): Promise<WellnessReading | null> {
    const ci = await this.deps.fetchCheckIn(userId, date);
    if (!ci) return null;
    // Map subjective inputs to a 0-100 recovery score.
    const recovery =
      ci.readiness * 8 +
      (ci.sleepHours ? Math.min(ci.sleepHours, 9) * 2.2 : 0) +
      (ci.sleepQuality ? ci.sleepQuality * 0.4 : 0);
    return {
      date: date.toISOString().slice(0, 10),
      source: this.source,
      sleepHours: ci.sleepHours ?? undefined,
      sleepScore: ci.sleepQuality ? ci.sleepQuality * 20 : undefined,
      recovery: Math.round(Math.min(100, recovery)),
      restingHr: ci.restingHr ?? undefined,
    };
  }
}
