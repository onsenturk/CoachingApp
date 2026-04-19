/**
 * Wellness adapter — pluggable source for HRV / sleep / recovery readings.
 *
 * v1 has `manual` (from DailyMetric) and `heuristic` (derived from Strava + load).
 * Future: oura, whoop, apple-health, garmin (when business approval lands).
 */

export type WellnessSource =
  | "manual"
  | "heuristic"
  | "oura"
  | "whoop"
  | "apple-health"
  | "garmin";

export interface WellnessReading {
  date: string; // YYYY-MM-DD
  source: WellnessSource;
  hrv?: number; // rMSSD ms (when available)
  sleepHours?: number;
  sleepScore?: number; // 0-100
  recovery?: number; // 0-100 composite
  restingHr?: number;
}

export interface WellnessAdapter {
  readonly source: WellnessSource;
  getReading(userId: string, date: Date): Promise<WellnessReading | null>;
}
