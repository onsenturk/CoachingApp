import { z } from "zod";

/** Strava sport types relevant to running + cycling. */
export const SportTypeSchema = z.enum([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Ride",
  "VirtualRide",
  "GravelRide",
  "MountainBikeRide",
  "EBikeRide",
  "EMountainBikeRide",
]);
export type SportType = z.infer<typeof SportTypeSchema>;

export const SummaryActivitySchema = z.object({
  id: z.number(),
  name: z.string(),
  sport_type: z.string(),
  type: z.string().optional(),
  distance: z.number(),
  moving_time: z.number(),
  elapsed_time: z.number(),
  total_elevation_gain: z.number().optional(),
  start_date: z.string(),
  start_date_local: z.string(),
  timezone: z.string().optional(),
  trainer: z.boolean().optional(),
  manual: z.boolean().optional(),
  has_heartrate: z.boolean().optional(),
  average_heartrate: z.number().optional(),
  max_heartrate: z.number().optional(),
  average_watts: z.number().optional(),
  weighted_average_watts: z.number().optional(),
  device_watts: z.boolean().optional(),
  average_speed: z.number().optional(),
  average_cadence: z.number().optional(),
  kilojoules: z.number().optional(),
  elev_high: z.number().optional(),
  elev_low: z.number().optional(),
});
export type SummaryActivity = z.infer<typeof SummaryActivitySchema>;

export const DetailedAthleteSchema = z.object({
  id: z.number(),
  username: z.string().nullable().optional(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  ftp: z.number().nullable().optional(),
  measurement_preference: z.string().nullable().optional(),
});
export type DetailedAthlete = z.infer<typeof DetailedAthleteSchema>;

export const AthleteZonesSchema = z.object({
  heart_rate: z
    .object({
      custom_zones: z.boolean().optional(),
      zones: z.array(z.object({ min: z.number(), max: z.number() })),
    })
    .optional(),
  power: z
    .object({
      zones: z.array(z.object({ min: z.number(), max: z.number() })),
    })
    .optional(),
});
export type AthleteZones = z.infer<typeof AthleteZonesSchema>;

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  expires_in: z.number(),
  token_type: z.string(),
  athlete: DetailedAthleteSchema.optional(),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const StreamSetSchema = z.object({
  time: z.object({ data: z.array(z.number()) }).optional(),
  distance: z.object({ data: z.array(z.number()) }).optional(),
  heartrate: z.object({ data: z.array(z.number()) }).optional(),
  watts: z.object({ data: z.array(z.number()) }).optional(),
  cadence: z.object({ data: z.array(z.number()) }).optional(),
  altitude: z.object({ data: z.array(z.number()) }).optional(),
  velocity_smooth: z.object({ data: z.array(z.number()) }).optional(),
  latlng: z.object({ data: z.array(z.tuple([z.number(), z.number()])) }).optional(),
});
export type StreamSet = z.infer<typeof StreamSetSchema>;
