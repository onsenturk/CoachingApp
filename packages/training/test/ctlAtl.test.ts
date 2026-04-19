import { describe, it, expect } from "vitest";
import { computeCtlAtl, consecutiveDaysTsbBelow } from "../src/ctlAtl.js";

describe("computeCtlAtl", () => {
  it("starts both at 0 with no seed", () => {
    const out = computeCtlAtl([{ date: "2026-01-01", load: 0 }]);
    expect(out[0]!.ctl).toBe(0);
    expect(out[0]!.atl).toBe(0);
    expect(out[0]!.tsb).toBe(0);
  });
  it("ATL responds faster than CTL", () => {
    const days = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      load: 100,
    }));
    const out = computeCtlAtl(days);
    const last = out[out.length - 1]!;
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.tsb).toBeLessThan(0);
  });
});

describe("consecutiveDaysTsbBelow", () => {
  it("counts trailing run", () => {
    const curve = [
      { date: "1", ctl: 0, atl: 0, tsb: 0 },
      { date: "2", ctl: 0, atl: 0, tsb: -30 },
      { date: "3", ctl: 0, atl: 0, tsb: -28 },
      { date: "4", ctl: 0, atl: 0, tsb: -26 },
    ];
    expect(consecutiveDaysTsbBelow(curve, -25)).toBe(3);
  });
});
