/**
 * Typed Strava API v3 client.
 *
 * - Bearer token auth (caller passes `accessToken`).
 * - Refresh handled by `refreshToken()` when callers detect 401.
 * - Rate-limited via `RateLimiter`.
 */

import { z } from "zod";
import {
  SummaryActivitySchema,
  type SummaryActivity,
  DetailedAthleteSchema,
  type DetailedAthlete,
  AthleteZonesSchema,
  type AthleteZones,
  StreamSetSchema,
  type StreamSet,
  TokenResponseSchema,
  type TokenResponse,
} from "./types.js";
import { RateLimiter } from "./rateLimiter.js";

const STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_URL = "https://www.strava.com/oauth/token";

export interface StravaClientOptions {
  clientId: string;
  clientSecret: string;
  rateLimiter?: RateLimiter;
}

export class StravaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Strava API ${status}: ${body.slice(0, 200)}`);
    this.name = "StravaApiError";
  }
}

export class StravaClient {
  private readonly limiter: RateLimiter;
  constructor(private readonly opts: StravaClientOptions) {
    this.limiter = opts.rateLimiter ?? new RateLimiter();
  }

  /** Exchange authorization code for tokens. */
  async exchangeCode(code: string): Promise<TokenResponse> {
    const res = await fetch(STRAVA_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    return parseJson(res, TokenResponseSchema);
  }

  /** Refresh expired token. */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const res = await fetch(STRAVA_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    return parseJson(res, TokenResponseSchema);
  }

  async getAthlete(accessToken: string): Promise<DetailedAthlete> {
    return this.get(accessToken, "/athlete", DetailedAthleteSchema);
  }

  async getAthleteZones(accessToken: string): Promise<AthleteZones> {
    return this.get(accessToken, "/athlete/zones", AthleteZonesSchema);
  }

  /** List activities (paginated). Set `after` to a UNIX timestamp. */
  async listActivities(
    accessToken: string,
    params: { before?: number; after?: number; page?: number; per_page?: number } = {},
  ): Promise<SummaryActivity[]> {
    const qs = new URLSearchParams();
    if (params.before) qs.set("before", String(params.before));
    if (params.after) qs.set("after", String(params.after));
    qs.set("page", String(params.page ?? 1));
    qs.set("per_page", String(params.per_page ?? 100));
    return this.get(accessToken, `/athlete/activities?${qs}`, z.array(SummaryActivitySchema));
  }

  /** Page through all activities since `afterEpochSec`. */
  async *iterateAllActivities(
    accessToken: string,
    afterEpochSec: number,
  ): AsyncGenerator<SummaryActivity> {
    let page = 1;
    while (true) {
      const batch = await this.listActivities(accessToken, {
        after: afterEpochSec,
        page,
        per_page: 100,
      });
      for (const a of batch) yield a;
      if (batch.length < 100) return;
      page++;
    }
  }

  async getActivityStreams(
    accessToken: string,
    activityId: number | bigint,
    keys: string[] = ["time", "heartrate", "watts", "distance", "cadence", "altitude", "velocity_smooth"],
  ): Promise<StreamSet> {
    const qs = new URLSearchParams({ keys: keys.join(","), key_by_type: "true" });
    return this.get(accessToken, `/activities/${activityId}/streams?${qs}`, StreamSetSchema);
  }

  // ─── internals ────────────────────────────────────────────────────

  private async get<S extends z.ZodTypeAny>(
    accessToken: string,
    path: string,
    schema: S,
  ): Promise<z.infer<S>> {
    await this.limiter.acquire();
    const res = await fetch(`${STRAVA_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return parseJson(res, schema);
  }
}

async function parseJson<S extends z.ZodTypeAny>(res: Response, schema: S): Promise<z.infer<S>> {
  const text = await res.text();
  if (!res.ok) throw new StravaApiError(res.status, text);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new StravaApiError(res.status, `Non-JSON response: ${text.slice(0, 200)}`);
  }
  return schema.parse(json);
}
