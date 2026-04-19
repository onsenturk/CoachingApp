import { describe, it, expect } from "vitest";
import { assessReadiness } from "../src/readiness.js";

describe("assessReadiness", () => {
  it("returns red+injured_pause when injured", () => {
    const a = assessReadiness({ readiness: 8, injured: true, sick: false });
    expect(a.level).toBe("red");
    expect(a.action).toBe("injured_pause");
    expect(a.allowedActions).toEqual(["injured_pause"]);
  });
  it("forces deload when TSB < -25 for 3+ days", () => {
    const a = assessReadiness(
      { readiness: 7, injured: false, sick: false },
      { tsb: -30, tsbBelowThresholdDays: 3 },
    );
    expect(a.action).toBe("forced_deload");
  });
  it("amber on low readiness only", () => {
    const a = assessReadiness({ readiness: 5, injured: false, sick: false });
    expect(a.level).toBe("amber");
    expect(a.allowedActions).toContain("reduce_intensity");
  });
  it("red on RHR +8 vs avg", () => {
    const a = assessReadiness(
      { readiness: 8, restingHr: 60, injured: false, sick: false },
      { rhr14dAvg: 50 },
    );
    expect(a.level).toBe("red");
  });
  it("never allows quality on red", () => {
    const a = assessReadiness({ readiness: 2, injured: false, sick: false });
    expect(a.allowedActions).not.toContain("keep");
    expect(a.allowedActions).not.toContain("reduce_intensity");
  });
});
