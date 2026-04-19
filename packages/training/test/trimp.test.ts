import { describe, it, expect } from "vitest";
import { trimpBanister, trimpFromPace } from "../src/trimp.js";

describe("trimpBanister", () => {
  it("returns 0 for invalid HR config", () => {
    expect(trimpBanister({ durationSec: 3600, averageHr: 140, restingHr: 200, maxHr: 180 })).toBe(0);
  });
  it("computes a known reference (M, 60 min, HRR=0.7)", () => {
    // HRR = 0.7, b = 1.92 → 60 * 0.7 * 0.64 * exp(1.344) ≈ 102.6
    const v = trimpBanister({ durationSec: 3600, averageHr: 154, restingHr: 50, maxHr: 200 });
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan(105);
  });
  it("is lower for women than men at the same HRR", () => {
    const m = trimpBanister({ durationSec: 3600, averageHr: 154, restingHr: 50, maxHr: 200, sex: "M" });
    const f = trimpBanister({ durationSec: 3600, averageHr: 154, restingHr: 50, maxHr: 200, sex: "F" });
    expect(f).toBeLessThan(m);
  });
});

describe("trimpFromPace", () => {
  it("weights zones correctly", () => {
    // 60 min in Z2: 60 * 2 = 120
    expect(trimpFromPace({ z1: 0, z2: 3600, z3: 0, z4: 0, z5: 0 })).toBe(120);
  });
});
