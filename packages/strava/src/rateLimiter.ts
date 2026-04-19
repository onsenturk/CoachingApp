/**
 * Simple per-process rate limiter aware of Strava's:
 *   - 100 requests / 15 min (short window)
 *   - 1000 requests / day (long window)
 *
 * In a multi-instance deployment, swap this for a Redis-backed limiter.
 */

export class RateLimiter {
  private timestamps: number[] = [];
  private dayCount = 0;
  private dayWindowStart = Date.now();

  constructor(
    private readonly shortMaxRequests = 100,
    private readonly shortWindowMs = 15 * 60 * 1000,
    private readonly dailyMax = 1000,
  ) {}

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      // Reset day window
      if (now - this.dayWindowStart >= 24 * 60 * 60 * 1000) {
        this.dayWindowStart = now;
        this.dayCount = 0;
      }
      // Drop expired short-window timestamps
      this.timestamps = this.timestamps.filter((t) => now - t < this.shortWindowMs);

      if (this.dayCount >= this.dailyMax) {
        const wait = 24 * 60 * 60 * 1000 - (now - this.dayWindowStart);
        await sleep(wait);
        continue;
      }
      if (this.timestamps.length >= this.shortMaxRequests) {
        const oldest = this.timestamps[0]!;
        const wait = this.shortWindowMs - (now - oldest) + 50;
        await sleep(Math.max(50, wait));
        continue;
      }
      this.timestamps.push(now);
      this.dayCount++;
      return;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
