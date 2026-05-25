import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coaching/db";
import {
  FoundryAgentClient,
  RunCounter,
  govern,
  schemas,
  type AuditWriter,
} from "@coaching/ai";
import { ctlAtl, dailyRecommendation, readiness } from "@coaching/training";

const FOUNDRY_ENDPOINT = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT ?? "";
const AGENT_PREFIX = process.env.AZURE_FOUNDRY_AGENT_PREFIX ?? "coaching";
const RECOMMENDATION_AGENT = "daily-recommendation";

const RUN_BIKE_SPORT_TYPES = [
  "Run",
  "TrailRun",
  "VirtualRun",
  "Ride",
  "VirtualRide",
  "MountainBikeRide",
  "GravelRide",
] as const;

const audit: AuditWriter = async (entry) => {
  await prisma.aIRunLog.create({
    data: {
      agent: entry.agent,
      tool: entry.tool ?? null,
      decision: entry.decision,
      reason: entry.reason ?? null,
      policyName: entry.policyName ?? null,
      evidenceJson: (entry.evidenceJson as object | undefined) ?? undefined,
    },
  });
};

export async function GET(request: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const preferences = parsePreferences(url.searchParams);
  if (!preferences.ok) {
    return NextResponse.json(
      {
        error: "Invalid recommendation preferences",
        details: preferences.errors,
      },
      { status: 400 },
    );
  }

  if (!FOUNDRY_ENDPOINT) {
    await audit({
      agent: RECOMMENDATION_AGENT,
      tool: "invoke",
      decision: "error",
      reason: "AZURE_FOUNDRY_PROJECT_ENDPOINT not configured.",
      policyName: "config",
    });
    return NextResponse.json(
      { error: "AI daily recommendation is not configured." },
      { status: 503 },
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const since7 = new Date(today);
  since7.setUTCDate(
    since7.getUTCDate() - dailyRecommendation.RECOMMENDATION_WINDOW_DAYS,
  );
  const since14 = new Date(today);
  since14.setUTCDate(since14.getUTCDate() - 14);
  const since60 = new Date(today);
  since60.setUTCDate(since60.getUTCDate() - 60);

  const [
    user,
    activities7,
    dailyMetrics14,
    recentLoadActivities,
    plannedSession,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentCtl: true, currentAtl: true, currentTsb: true },
    }),
    prisma.activity.findMany({
      where: {
        userId,
        startDate: { gte: since7 },
        sportType: { in: [...RUN_BIKE_SPORT_TYPES] },
      },
      orderBy: { startDate: "desc" },
      select: {
        sportType: true,
        startDate: true,
        movingTime: true,
        distance: true,
        tss: true,
        trimp: true,
        intensityFactor: true,
      },
    }),
    prisma.dailyMetric.findMany({
      where: { userId, date: { gte: since14 } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        readiness: true,
        sleepHours: true,
        sleepQuality: true,
        restingHr: true,
        soreness: true,
        injured: true,
        sick: true,
      },
    }),
    prisma.activity.findMany({
      where: { userId, startDate: { gte: since60 } },
      orderBy: { startDate: "asc" },
      select: { startDate: true, tss: true, trimp: true },
    }),
    prisma.plannedSession.findFirst({
      where: {
        date: today,
        program: { userId, status: "active" },
      },
      select: {
        sport: true,
        workoutType: true,
        durationMin: true,
        isHard: true,
      },
    }),
  ]);

  if (!user) return new NextResponse("User not found", { status: 404 });

  const activityInputs = activities7.map((activity) => ({
    sportType: activity.sportType,
    startDate: activity.startDate,
    movingTimeSec: activity.movingTime,
    distanceM: activity.distance,
    tss: activity.tss,
    trimp: activity.trimp,
    intensityFactor: activity.intensityFactor,
  }));
  const pattern = dailyRecommendation.analyzeEffortWindow(
    activityInputs,
    today,
  );
  const effortSummaries = dailyRecommendation.summarizeEffortsForAgent(
    activityInputs,
    today,
  );
  const assessment = buildReadinessAssessment(
    dailyMetrics14,
    recentLoadActivities,
    todayIso,
  );
  const requestedDurationBucket = preferences.value.durationBucket ?? "20to40";
  const requestedEffort = preferences.value.effort ?? "moderate";
  const requestedSport = preferences.value.sport ?? "run";

  const counter = new RunCounter();
  const decision = await govern(
    {
      agent: RECOMMENDATION_AGENT,
      tool: "get_recent_efforts",
      args: {
        userId,
        windowDays: dailyRecommendation.RECOMMENDATION_WINDOW_DAYS,
        preferences: preferences.value,
      },
      userInput: JSON.stringify(preferences.value),
    },
    { runCounter: counter, audit },
  );
  if (decision.decision === "deny") {
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  }
  if (decision.decision === "error") {
    return NextResponse.json({ error: "Governance error" }, { status: 500 });
  }

  const agentPayload = {
    input: {
      today: todayIso,
      preferences: {
        sport: requestedSport,
        durationBucket: requestedDurationBucket,
        effort: requestedEffort,
      },
      effortWindow: {
        days: dailyRecommendation.RECOMMENDATION_WINDOW_DAYS,
        summary: pattern,
        efforts: effortSummaries,
      },
      readinessAssessment: assessment,
      loadContext: {
        ctl: user.currentCtl,
        atl: user.currentAtl,
        tsb: user.currentTsb,
      },
      plannedSession,
      safetyConstraints: buildSafetyConstraints(assessment, pattern),
    },
  };

  const agentResult = await invokeRecommendationAgent(
    JSON.stringify(agentPayload),
  );
  if (!agentResult.ok) {
    return NextResponse.json(agentResult.body, { status: agentResult.status });
  }

  let output = agentResult.output;
  let latencyMs = agentResult.latencyMs;
  const safetyIssues = validateAgentRecommendation(
    output,
    requestedSport,
    assessment,
    pattern,
  );

  if (safetyIssues.length > 0) {
    await audit({
      agent: RECOMMENDATION_AGENT,
      tool: "invoke",
      decision: "error",
      reason:
        "Agent recommendation violated safety constraints; retrying once.",
      policyName: "schema",
      evidenceJson: { issues: safetyIssues },
    });
    const retry = await invokeRecommendationAgent(
      JSON.stringify({
        ...agentPayload,
        previousOutputRejected: true,
        violations: safetyIssues,
      }),
    );
    if (!retry.ok) {
      return NextResponse.json(retry.body, { status: retry.status });
    }
    const retryIssues = validateAgentRecommendation(
      retry.output,
      requestedSport,
      assessment,
      pattern,
    );
    if (retryIssues.length > 0) {
      await audit({
        agent: RECOMMENDATION_AGENT,
        tool: "invoke",
        decision: "error",
        reason: "Agent recommendation failed safety constraints after retry.",
        policyName: "schema",
        evidenceJson: { issues: retryIssues },
      });
      return NextResponse.json(
        {
          error: "Daily recommendation failed safety validation.",
          details: retryIssues,
        },
        { status: 502 },
      );
    }
    output = retry.output;
    latencyMs += retry.latencyMs;
  }

  await audit({
    agent: RECOMMENDATION_AGENT,
    tool: "invoke",
    decision: "allow",
    reason: "Daily recommendation generated by Foundry agent.",
    policyName: "foundry",
    evidenceJson: { latencyMs },
  });

  const recommendation: dailyRecommendation.WorkoutRecommendation = {
    ...output,
    requestedDurationBucket,
    requestedEffort,
    source: "agent",
    planContext: plannedSession ? "planned-session" : "ad-hoc",
    safetyDowngraded:
      output.durationBucket !== requestedDurationBucket ||
      output.effort !== requestedEffort,
    pattern,
  };

  return NextResponse.json({ recommendation });
}

async function invokeRecommendationAgent(message: string): Promise<
  | {
      ok: true;
      output: schemas.WorkoutRecommendationOutput;
      latencyMs: number;
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const foundry = new FoundryAgentClient({
    projectEndpoint: FOUNDRY_ENDPOINT,
    agentNamePrefix: AGENT_PREFIX,
  });
  const startedAt = Date.now();
  let outputText: string;
  try {
    const out = await foundry.invoke({
      useCaseId: RECOMMENDATION_AGENT,
      message,
      metadata: { feature: "daily-recommendation" },
    });
    outputText = out.outputText;
  } catch (err) {
    await audit({
      agent: RECOMMENDATION_AGENT,
      tool: "invoke",
      decision: "error",
      reason:
        err instanceof Error ? err.message.slice(0, 500) : "invoke failed",
      policyName: "foundry",
    });
    return {
      ok: false,
      status: 502,
      body: { error: "Daily recommendation agent failed to respond." },
    };
  }
  const latencyMs = Date.now() - startedAt;

  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(outputText));
  } catch {
    await audit({
      agent: RECOMMENDATION_AGENT,
      tool: "invoke",
      decision: "error",
      reason: "Output not parseable as JSON.",
      policyName: "schema",
      evidenceJson: { latencyMs },
    });
    return {
      ok: false,
      status: 502,
      body: { error: "Daily recommendation agent returned invalid JSON." },
    };
  }

  const parsed = schemas.WorkoutRecommendationOutputSchema.safeParse(json);
  if (!parsed.success) {
    await audit({
      agent: RECOMMENDATION_AGENT,
      tool: "invoke",
      decision: "error",
      reason: "Output failed schema validation.",
      policyName: "schema",
      evidenceJson: { latencyMs, issues: parsed.error.flatten() },
    });
    return {
      ok: false,
      status: 502,
      body: {
        error: "Daily recommendation failed schema validation.",
        details: parsed.error.flatten(),
      },
    };
  }

  return { ok: true, output: parsed.data, latencyMs };
}

function parsePreferences(searchParams: URLSearchParams):
  | {
      ok: true;
      value: dailyRecommendation.RecommendationPreferences;
    }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const sport = searchParams.get("sport");
  const durationBucket = searchParams.get("durationBucket");
  const effort = searchParams.get("effort");
  const value: dailyRecommendation.RecommendationPreferences = {};

  if (sport != null) {
    if (isSport(sport)) value.sport = sport;
    else errors.push("sport must be run or bike");
  }

  if (durationBucket != null) {
    if (isDurationBucket(durationBucket)) value.durationBucket = durationBucket;
    else errors.push("durationBucket must be under20, 20to40, or over40");
  }

  if (effort != null) {
    if (isEffort(effort)) value.effort = effort;
    else errors.push("effort must be easy, moderate, or hard");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

function buildReadinessAssessment(
  dailyMetrics: Array<{
    date: Date;
    readiness: number;
    sleepHours: number | null;
    sleepQuality: number | null;
    restingHr: number | null;
    soreness: number | null;
    injured: boolean;
    sick: boolean;
  }>,
  recentLoadActivities: Array<{
    startDate: Date;
    tss: number | null;
    trimp: number | null;
  }>,
  todayIso: string,
): readiness.ReadinessAssessment | null {
  const todayMetric = dailyMetrics.find(
    (metric) => metric.date.toISOString().slice(0, 10) === todayIso,
  );
  if (!todayMetric) return null;

  const rhrValues = dailyMetrics
    .map((metric) => metric.restingHr)
    .filter((value): value is number => value !== null);
  const rhr14dAvg = rhrValues.length
    ? rhrValues.reduce((sum, value) => sum + value, 0) / rhrValues.length
    : undefined;
  const curve = buildLoadCurve(recentLoadActivities);
  const tsb = curve[curve.length - 1]?.tsb;
  const tsbBelowThresholdDays = ctlAtl.consecutiveDaysTsbBelow(curve, -25);

  return readiness.assessReadiness(
    {
      readiness: todayMetric.readiness,
      sleepHours: todayMetric.sleepHours ?? undefined,
      sleepQuality: todayMetric.sleepQuality ?? undefined,
      restingHr: todayMetric.restingHr ?? undefined,
      soreness: todayMetric.soreness ?? undefined,
      injured: todayMetric.injured,
      sick: todayMetric.sick,
    },
    { rhr14dAvg, tsb, tsbBelowThresholdDays },
  );
}

function buildLoadCurve(
  activities: Array<{
    startDate: Date;
    tss: number | null;
    trimp: number | null;
  }>,
) {
  const byDay = new Map<string, number>();
  for (const activity of activities) {
    const day = activity.startDate.toISOString().slice(0, 10);
    byDay.set(
      day,
      (byDay.get(day) ?? 0) + (activity.tss ?? activity.trimp ?? 0),
    );
  }
  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, load]) => ({ date, load }));
  return ctlAtl.computeCtlAtl(series);
}

function buildSafetyConstraints(
  assessment: readiness.ReadinessAssessment | null,
  pattern: dailyRecommendation.EffortWindowPattern,
) {
  return {
    selectedSportMustBeUsed: true,
    noHardWhenReadinessRed: assessment?.level === "red",
    noHardAfterRecentHardEffort: pattern.hardEffortWithin48h,
    restOnlyActions: ["forced_deload", "injured_pause"].includes(
      assessment?.action ?? "",
    ),
  };
}

function validateAgentRecommendation(
  output: schemas.WorkoutRecommendationOutput,
  requestedSport: dailyRecommendation.RecommendationSport,
  assessment: readiness.ReadinessAssessment | null,
  pattern: dailyRecommendation.EffortWindowPattern,
): string[] {
  const issues: string[] = [];
  if (output.sport !== requestedSport) {
    issues.push("sport must match the selected run/bike option");
  }
  if (assessment?.level === "red" && output.effort === "hard") {
    issues.push("hard effort is not allowed when readiness is red");
  }
  if (pattern.hardEffortWithin48h && output.effort === "hard") {
    issues.push("hard effort is not allowed within 48 hours of a hard effort");
  }
  if (["forced_deload", "injured_pause"].includes(assessment?.action ?? "")) {
    if (output.effort !== "easy") {
      issues.push("forced deload or injury pause must use easy effort");
    }
    if (!(["rest", "recovery"] as string[]).includes(output.workoutType)) {
      issues.push("forced deload or injury pause must return rest or recovery");
    }
    if (output.durationMin > 20) {
      issues.push(
        "forced deload or injury pause must cap duration at 20 minutes",
      );
    }
  }
  return issues;
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```json\s*|^```\s*|\s*```$/g, "");
}

function isSport(
  value: string,
): value is dailyRecommendation.RecommendationSport {
  return dailyRecommendation.RECOMMENDATION_SPORTS.includes(
    value as dailyRecommendation.RecommendationSport,
  );
}

function isDurationBucket(
  value: string,
): value is dailyRecommendation.RecommendationDurationBucket {
  return dailyRecommendation.RECOMMENDATION_DURATION_BUCKETS.includes(
    value as dailyRecommendation.RecommendationDurationBucket,
  );
}

function isEffort(
  value: string,
): value is dailyRecommendation.RecommendationEffort {
  return dailyRecommendation.RECOMMENDATION_EFFORTS.includes(
    value as dailyRecommendation.RecommendationEffort,
  );
}
