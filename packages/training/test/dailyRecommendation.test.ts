import { describe, expect, it } from "vitest";
import {
  analyzeEffortWindow,
  mapSportType,
  summarizeEffortsForAgent,
  type RecommendationActivity,
} from "../src/dailyRecommendation.js";

const today = new Date("2026-05-25T12:00:00.000Z");

function activity(
  daysAgo: number,
  overrides: Partial<RecommendationActivity> = {},
): RecommendationActivity {
  const startDate = new Date(today);
  startDate.setUTCDate(today.getUTCDate() - daysAgo);
  return {
    sportType: "Run",
    startDate,
    movingTimeSec: 35 * 60,
    distanceM: 6_000,
    ...overrides,
  };
}

describe("analyzeEffortWindow", () => {
  it("summarizes only the last 7 days of run and bike efforts", () => {
    const pattern = analyzeEffortWindow(
      [
        activity(1),
        activity(2, { sportType: "Ride", movingTimeSec: 50 * 60 }),
        activity(9, { movingTimeSec: 90 * 60 }),
      ],
      today,
    );

    expect(pattern.windowDays).toBe(7);
    expect(pattern.effortCount).toBe(2);
    expect(pattern.sportCounts).toEqual({ run: 1, bike: 1 });
    expect(pattern.totalDurationMin).toBe(85);
  });

  it("counts a training streak ending yesterday", () => {
    const pattern = analyzeEffortWindow(
      [activity(1), activity(2), activity(3), activity(4), activity(5)],
      today,
    );

    expect(pattern.consecutiveTrainingDays).toBe(5);
  });

  it("flags a hard effort within the last 48 hours", () => {
    const pattern = analyzeEffortWindow([activity(1, { tss: 95 })], today);

    expect(pattern.hardEffortCount).toBe(1);
    expect(pattern.hardEffortWithin48h).toBe(true);
  });
});

describe("summarizeEffortsForAgent", () => {
  it("returns compact effort records for the agent", () => {
    const efforts = summarizeEffortsForAgent(
      [activity(1, { sportType: "VirtualRide", trimp: 55 })],
      today,
    );

    expect(efforts).toEqual([
      {
        date: "2026-05-24",
        sport: "bike",
        durationMin: 35,
        distanceM: 6_000,
        tss: undefined,
        trimp: 55,
        intensityFactor: undefined,
        hard: false,
      },
    ]);
  });
});

describe("mapSportType", () => {
  it("maps Strava run and bike sport types", () => {
    expect(mapSportType("TrailRun")).toBe("run");
    expect(mapSportType("GravelRide")).toBe("bike");
    expect(mapSportType("Swim")).toBeNull();
  });
});
