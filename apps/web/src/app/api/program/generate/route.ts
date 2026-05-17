/**
 * POST /api/program/generate
 *
 * 1. Auth + validate body against `GoalInputSchema`.
 * 2. Pull recent run history → `computeRunBaseline`.
 * 3. Derive target pacing from current prediction + selected program intensity.
 * 4. Build the agent input (athlete profile, baseline, goal, paces, zones,
 *    feasibility, hard constraints from policy.yaml).
 * 5. Pass through `govern()` (fail-closed: deny → 403, error → 500).
 * 6. Invoke the `plan-generator` Foundry agent.
 * 7. Validate JSON output with `PlanGeneratorOutputSchema` and run the
 *    physiological `validatePlan` rules. Rule violations are stored as draft
 *    warnings so the user can review them before accepting.
 * 8. In a single transaction: discard prior drafts, create the new draft
 *    `Program`, and bulk-insert `PlannedSession[]`.
 *
 * Returns: `{ draftProgramId, weeksTotal, sessionsCount, feasibility, warnings }`.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coaching/db";
import { Prisma } from "@coaching/db";
import {
  FoundryAgentClient,
  RunCounter,
  govern,
  schemas,
  type AuditWriter,
} from "@coaching/ai";
import {
  baseline as baselineFns,
  racePrediction,
  rules,
  targetPaces,
  zones,
} from "@coaching/training";

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

const FOUNDRY_ENDPOINT = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT ?? "";
const AGENT_PREFIX = process.env.AZURE_FOUNDRY_AGENT_PREFIX ?? "coaching";
const MODEL = process.env.AZURE_FOUNDRY_MODEL ?? "unknown";
const GENERATED_BY = `plan-generator@${MODEL}`;

const RUN_SPORT_TYPES = ["Run", "TrailRun", "VirtualRun"] as const;

const INTENSITY_TARGET_TIME_FACTOR: Record<schemas.ProgramIntensity, number> = {
  easy: 1.05,
  moderate: 1,
  aggressive: 0.96,
};

const INTENSITY_PACE_STRATEGY: Record<schemas.ProgramIntensity, string> = {
  easy: "Use conservative target paces roughly 5% slower than the current prediction and prioritize completion.",
  moderate:
    "Use target paces aligned with the current prediction and balance progression with recovery.",
  aggressive:
    "Use ambitious target paces roughly 4% faster than the current prediction while respecting all physiological guardrails.",
};

function defaultGoalDateIso(weeksTotal: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + weeksTotal * 7);
  return date.toISOString().slice(0, 10);
}

function deriveTargetTimeSec(
  predictedSec: number | undefined,
  programIntensity: schemas.ProgramIntensity,
): number | null {
  if (!predictedSec || !Number.isFinite(predictedSec) || predictedSec <= 0) {
    return null;
  }
  return Math.max(
    60,
    Math.round(predictedSec * INTENSITY_TARGET_TIME_FACTOR[programIntensity]),
  );
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  // 1. Validate body.
  const body = await req.json().catch(() => null);
  const parsedGoal = schemas.GoalInputSchema.safeParse(body);
  if (!parsedGoal.success) {
    return NextResponse.json(
      { error: "Invalid goal payload", details: parsedGoal.error.flatten() },
      { status: 400 },
    );
  }
  const goal = parsedGoal.data;
  const goalDateIso = goal.goalDate ?? defaultGoalDateIso(goal.weeksTotal);
  const goalDate = new Date(`${goalDateIso}T00:00:00.000Z`);

  // 2. Build baseline from last 90 days of run activities.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);
  const [user, activities] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.activity.findMany({
      where: {
        userId,
        startDate: { gte: since },
        sportType: { in: [...RUN_SPORT_TYPES] },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);
  if (!user) return new NextResponse("User not found", { status: 404 });

  const runBaseline = baselineFns.computeRunBaseline(
    activities.map((a) => ({
      startDate: a.startDate,
      sportType: a.sportType,
      distanceM: a.distance,
      movingTimeSec: a.movingTime,
      averageHr: a.averageHr ?? undefined,
      averageWatts: a.averageWatts ?? undefined,
      weightedAvgWatts: a.weightedAvgWatts ?? undefined,
    })),
  );
  const currentGoalPrediction = racePrediction
    .predictRaceTimes(
      activities.map((a) => ({
        startDate: a.startDate,
        distanceM: a.distance,
        movingTimeSec: a.movingTime,
      })),
      { thresholdPaceSecPerKm: runBaseline.thresholdPaceSecPerKm },
    )
    .find((prediction) => Math.abs(prediction.distanceM - goal.distanceM) < 50);
  const derivedTargetTimeSec =
    goal.targetTimeSec ??
    deriveTargetTimeSec(
      currentGoalPrediction?.predictedSec,
      goal.programIntensity,
    );

  // 3. Goal-feasibility and pacing strategy.
  let feasibility: rules.FeasibilityResult = {
    feasibility: "green",
    reason:
      "No current race prediction available — plan will build distance capacity with conservative pacing.",
    requiredPaceSecPerKm: 0,
    requiredImprovementPct: 0,
  };
  const weeksUntilRace = Math.max(
    1,
    Math.ceil((goalDate.getTime() - Date.now()) / (7 * 24 * 3600_000)),
  );
  if (derivedTargetTimeSec && runBaseline.thresholdPaceSecPerKm) {
    feasibility = rules.checkFeasibility({
      goalType: goal.goalType,
      goalDistanceM: goal.distanceM,
      goalTimeSec: derivedTargetTimeSec,
      weeksUntilRace,
      currentThresholdPaceSecPerKm: runBaseline.thresholdPaceSecPerKm,
      currentLongestM: runBaseline.longestRunM,
      currentWeeklyVolumeM: runBaseline.weeklyVolumeM,
    });
  } else if (!runBaseline.thresholdPaceSecPerKm) {
    feasibility = {
      feasibility: "amber",
      reason:
        "Limited running history — plan will be conservative and ramp slowly.",
      requiredPaceSecPerKm: 0,
      requiredImprovementPct: 0,
    };
  }

  // 4. Build agent input payload.
  const racePaces = derivedTargetTimeSec
    ? targetPaces.targetsFromGoal(goal.distanceM, derivedTargetTimeSec)
    : null;
  const hrZones =
    user.maxHr && user.restingHr
      ? zones.hrZonesFromMaxAndRest(user.maxHr, user.restingHr)
      : null;

  const agentPayload = {
    athleteProfile: {
      sex: user.sex,
      weightKg: user.weightKg,
      maxHr: user.maxHr,
      restingHr: user.restingHr,
      currentCtl: user.currentCtl,
      currentAtl: user.currentAtl,
      currentTsb: user.currentTsb,
    },
    runBaseline,
    goal: {
      goalType: goal.goalType,
      distanceM: goal.distanceM,
      targetTimeSec: derivedTargetTimeSec,
      userProvidedTargetTimeSec: goal.targetTimeSec ?? null,
      goalDate: goalDateIso,
      weeksTotal: goal.weeksTotal,
      sessionsPerWk: goal.sessionsPerWk,
      programIntensity: goal.programIntensity,
      paceStrategy: INTENSITY_PACE_STRATEGY[goal.programIntensity],
      sport: goal.sport,
    },
    paces: racePaces,
    hrZones,
    feasibility,
    currentGoalPrediction: currentGoalPrediction
      ? {
          label: currentGoalPrediction.label,
          predictedSec: currentGoalPrediction.predictedSec,
          paceSecPerKm: currentGoalPrediction.paceSecPerKm,
          source: currentGoalPrediction.source,
        }
      : null,
    constraints: rules.RULES,
    today: new Date().toISOString().slice(0, 10),
  };

  // 5. Governance.
  if (!FOUNDRY_ENDPOINT) {
    await audit({
      agent: "plan-generator",
      tool: "get_baseline",
      decision: "error",
      reason: "AZURE_FOUNDRY_PROJECT_ENDPOINT not configured.",
      policyName: "config",
    });
    return NextResponse.json(
      { error: "AI coach not configured (Foundry endpoint missing)." },
      { status: 503 },
    );
  }

  const counter = new RunCounter();
  const decision = await govern(
    {
      agent: "plan-generator",
      tool: "get_baseline",
      args: {
        userId,
        goalType: goal.goalType,
        weeksTotal: goal.weeksTotal,
        programIntensity: goal.programIntensity,
      },
      userInput: JSON.stringify(goal),
    },
    { runCounter: counter, audit },
  );
  if (decision.decision === "deny") {
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  }
  if (decision.decision === "error") {
    return NextResponse.json({ error: "Governance error" }, { status: 500 });
  }

  // 6. Invoke the Foundry agent (with up to 1 retry on rule violations).
  const foundry = new FoundryAgentClient({
    projectEndpoint: FOUNDRY_ENDPOINT,
    agentNamePrefix: AGENT_PREFIX,
  });

  type RunResult =
    | {
        ok: true;
        plan: schemas.PlanGeneratorOutput;
        latencyMs: number;
        previousResponseId?: string;
      }
    | { ok: false; status: number; body: Record<string, unknown> };

  const runOnce = async (
    message: string,
    previousResponseId?: string,
  ): Promise<RunResult> => {
    const startedAt = Date.now();
    let outputText: string;
    let responseId: string | undefined;
    try {
      const out = await foundry.invoke({
        useCaseId: "plan-generator",
        message,
        previousResponseId,
        metadata: { userId, goalType: goal.goalType },
      });
      outputText = out.outputText;
      responseId = out.responseId;
    } catch (err) {
      await audit({
        agent: "plan-generator",
        tool: "invoke",
        decision: "error",
        reason:
          err instanceof Error ? err.message.slice(0, 500) : "invoke failed",
        policyName: "foundry",
      });
      return {
        ok: false,
        status: 502,
        body: { error: "Plan generator failed to respond." },
      };
    }
    const latencyMs = Date.now() - startedAt;

    let planJson: unknown;
    try {
      const cleaned = outputText.trim().replace(/^```json\s*|\s*```$/g, "");
      planJson = JSON.parse(cleaned);
    } catch {
      await audit({
        agent: "plan-generator",
        tool: "invoke",
        decision: "error",
        reason: "Output not parseable as JSON.",
        policyName: "schema",
        evidenceJson: { latencyMs },
      });
      return {
        ok: false,
        status: 502,
        body: { error: "Plan generator returned invalid JSON." },
      };
    }
    const parsedPlan = schemas.PlanGeneratorOutputSchema.safeParse(planJson);
    if (!parsedPlan.success) {
      await audit({
        agent: "plan-generator",
        tool: "invoke",
        decision: "error",
        reason: "Output failed schema validation.",
        policyName: "schema",
        evidenceJson: { latencyMs, issues: parsedPlan.error.flatten() },
      });
      return {
        ok: false,
        status: 502,
        body: {
          error: "Plan failed schema validation.",
          details: parsedPlan.error.flatten(),
        },
      };
    }
    return {
      ok: true,
      plan: parsedPlan.data,
      latencyMs,
      previousResponseId: responseId,
    };
  };

  // First attempt.
  let attempt = await runOnce(JSON.stringify(agentPayload));
  if (!attempt.ok) {
    return NextResponse.json(attempt.body, { status: attempt.status });
  }
  let plan = attempt.plan;
  let latencyMs = attempt.latencyMs;
  let previousResponseId = attempt.previousResponseId;

  // 7. Physiological rule check, with one retry that feeds violations back.
  let validation = rules.validatePlan({
    weeksTotal: plan.weeksTotal,
    sessionsPerWk: plan.sessionsPerWk,
    sessions: plan.sessions.map((s) => ({
      date: s.date,
      weekIndex: s.weekIndex,
      dayOfWeek: s.dayOfWeek,
      workoutType: s.workoutType,
      durationMin: s.durationMin,
      distanceM: s.distanceM,
      isHard: s.isHard,
    })),
    goalDistanceM: goal.distanceM,
    goalTimeSec: derivedTargetTimeSec ?? undefined,
    currentPredictedGoalTimeSec: currentGoalPrediction?.predictedSec,
    baselineLongestM: runBaseline.longestRunM,
    baselineWeeklyVolumeM: runBaseline.weeklyVolumeM,
  });

  let safetyRetryWarning: {
    message: string;
    violations: rules.RuleViolation[];
  } | null = null;

  if (!validation.ok) {
    const firstAttemptViolations = validation.violations;
    await audit({
      agent: "plan-generator",
      tool: "invoke",
      decision: "allow",
      reason: "Plan violated rules — retrying once.",
      policyName: "rules",
      evidenceJson: { latencyMs, violations: firstAttemptViolations },
    });
    const fixMessage = JSON.stringify({
      ...agentPayload,
      previousPlanRejected: true,
      reason:
        "A prior plan attempt violated the physiological constraints listed below. Generate a NEW plan that satisfies every rule. Same JSON schema. Do not reference the previous plan.",
      violations: firstAttemptViolations,
    });
    // Send as a fresh request (no previous_response_id) to avoid cumulative
    // content-filter triggers on replayed conversation context.
    const retry = await runOnce(fixMessage);
    if (!retry.ok) {
      return NextResponse.json(retry.body, { status: retry.status });
    }
    plan = retry.plan;
    latencyMs += retry.latencyMs;
    previousResponseId = retry.previousResponseId;
    validation = rules.validatePlan({
      weeksTotal: plan.weeksTotal,
      sessionsPerWk: plan.sessionsPerWk,
      sessions: plan.sessions.map((s) => ({
        date: s.date,
        weekIndex: s.weekIndex,
        dayOfWeek: s.dayOfWeek,
        workoutType: s.workoutType,
        durationMin: s.durationMin,
        distanceM: s.distanceM,
        isHard: s.isHard,
      })),
      goalDistanceM: goal.distanceM,
      goalTimeSec: derivedTargetTimeSec ?? undefined,
      currentPredictedGoalTimeSec: currentGoalPrediction?.predictedSec,
      baselineLongestM: runBaseline.longestRunM,
      baselineWeeklyVolumeM: runBaseline.weeklyVolumeM,
    });
    if (validation.ok) {
      safetyRetryWarning = {
        message:
          "The first plan attempt violated physiological rules, so the AI coach regenerated a safer plan. Review the new plan before following it.",
        violations: firstAttemptViolations,
      };
    }
  }

  const ruleViolationWarning = !validation.ok
    ? {
        message:
          "This draft violates physiological guardrails. Review the warnings before accepting it.",
        violations: validation.violations,
      }
    : null;

  if (ruleViolationWarning) {
    await audit({
      agent: "plan-generator",
      tool: "invoke",
      decision: "allow",
      reason: "Draft persisted with physiological rule warnings.",
      policyName: "rules",
      evidenceJson: { latencyMs, violations: validation.violations },
    });
  }

  // 8. Persist atomically. Replace only prior drafts; active plans stay active until acceptance.
  const created = await prisma.$transaction(async (tx) => {
    await tx.program.updateMany({
      where: { userId, status: "draft" },
      data: { status: "discarded" },
    });
    const program = await tx.program.create({
      data: {
        userId,
        sport: goal.sport,
        goalType: goal.goalType,
        goalTargetSec: derivedTargetTimeSec ?? null,
        goalDate,
        weeksTotal: plan.weeksTotal,
        sessionsPerWk: plan.sessionsPerWk,
        feasibility: plan.feasibility,
        feasibilityReason: plan.feasibilityReason,
        status: "draft",
        generatedBy: GENERATED_BY,
        baselineJson: {
          runBaseline: runBaseline as unknown as object,
          paces: (racePaces ?? null) as unknown as object | null,
          hrZones: (hrZones ?? null) as unknown as object | null,
          ctlAtlTsbAtGenTime: {
            ctl: user.currentCtl,
            atl: user.currentAtl,
            tsb: user.currentTsb,
          },
        } as object,
        metaJson: {
          programIntensity: goal.programIntensity,
          userProvidedTargetTimeSec: goal.targetTimeSec ?? null,
          derivedTargetTimeSec: derivedTargetTimeSec ?? null,
          paceStrategy: INTENSITY_PACE_STRATEGY[goal.programIntensity],
          notes: plan.notes ?? null,
          suggestedAlternative: plan.suggestedAlternative ?? null,
          ruleValidation: {
            ok: validation.ok,
            violations: validation.violations,
          },
          safetyRetry: safetyRetryWarning
            ? {
                applied: true,
                acceptedAt: null,
                message: safetyRetryWarning.message,
                violations: safetyRetryWarning.violations,
              }
            : null,
          latencyMs,
        } as object,
      },
    });
    await tx.plannedSession.createMany({
      data: plan.sessions.map((s) => ({
        programId: program.id,
        date: new Date(s.date),
        weekIndex: s.weekIndex,
        dayOfWeek: s.dayOfWeek,
        sport: s.sport,
        workoutType: s.workoutType,
        durationMin: s.durationMin ?? null,
        distanceM: s.distanceM ?? null,
        description: s.description,
        structureJson: s.structure
          ? (s.structure as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        isHard: s.isHard,
        status: "planned",
      })),
    });
    return program;
  });

  const warnings = [
    ...(feasibility.feasibility === "red"
      ? [
          {
            message: feasibility.reason,
            feasibility: "red" as const,
          },
        ]
      : []),
    ...(safetyRetryWarning ? [safetyRetryWarning] : []),
    ...(ruleViolationWarning ? [ruleViolationWarning] : []),
  ];

  return NextResponse.json({
    draftProgramId: created.id,
    status: "draft",
    weeksTotal: plan.weeksTotal,
    sessionsCount: plan.sessions.length,
    feasibility: plan.feasibility,
    feasibilityReason: plan.feasibilityReason,
    warnings,
  });
}
