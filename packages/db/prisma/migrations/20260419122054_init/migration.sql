-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "stravaId" BIGINT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "sex" TEXT,
    "weightKg" DOUBLE PRECISION,
    "ftpWatts" INTEGER,
    "maxHr" INTEGER,
    "restingHr" INTEGER,
    "measurement" TEXT NOT NULL DEFAULT 'metric',
    "notifyAt" TEXT,
    "currentCtl" DOUBLE PRECISION,
    "currentAtl" DOUBLE PRECISION,
    "currentTsb" DOUBLE PRECISION,
    "loadComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaToken" (
    "userId" TEXT NOT NULL,
    "accessTokenEnc" BYTEA NOT NULL,
    "refreshTokenEnc" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "athleteJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaToken_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" BIGINT NOT NULL,
    "userId" TEXT NOT NULL,
    "sportType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startDateLocal" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "movingTime" INTEGER NOT NULL,
    "elapsedTime" INTEGER NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "elevationGain" DOUBLE PRECISION,
    "averageHr" DOUBLE PRECISION,
    "maxHr" INTEGER,
    "averageWatts" DOUBLE PRECISION,
    "weightedAvgWatts" INTEGER,
    "averageSpeed" DOUBLE PRECISION,
    "averageCadence" DOUBLE PRECISION,
    "kilojoules" DOUBLE PRECISION,
    "trainer" BOOLEAN NOT NULL DEFAULT false,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "hasHeartrate" BOOLEAN NOT NULL DEFAULT false,
    "deviceWatts" BOOLEAN NOT NULL DEFAULT false,
    "trimp" DOUBLE PRECISION,
    "tss" DOUBLE PRECISION,
    "intensityFactor" DOUBLE PRECISION,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityStream" (
    "activityId" BIGINT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityStream_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "ActivitySummary" (
    "activityId" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySummary_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "readiness" INTEGER NOT NULL,
    "sleepHours" DOUBLE PRECISION,
    "sleepQuality" INTEGER,
    "restingHr" INTEGER,
    "soreness" INTEGER,
    "mood" INTEGER,
    "injured" BOOLEAN NOT NULL DEFAULT false,
    "sick" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "hrv" DOUBLE PRECISION,
    "sleepScore" INTEGER,
    "recovery" INTEGER,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellnessReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "goalType" TEXT NOT NULL,
    "goalTargetSec" INTEGER,
    "goalDate" TIMESTAMP(3),
    "weeksTotal" INTEGER NOT NULL,
    "sessionsPerWk" INTEGER NOT NULL,
    "feasibility" TEXT NOT NULL,
    "feasibilityReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "generatedBy" TEXT NOT NULL,
    "baselineJson" JSONB NOT NULL,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedSession" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "sport" TEXT NOT NULL,
    "workoutType" TEXT NOT NULL,
    "durationMin" INTEGER,
    "distanceM" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "structureJson" JSONB,
    "isHard" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAdjustment" (
    "id" TEXT NOT NULL,
    "plannedSessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "readinessLevel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "newStructureJson" JSONB,
    "acceptedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRunLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "agent" TEXT NOT NULL,
    "tool" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "policyName" TEXT,
    "latencyMs" INTEGER,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stravaId_key" ON "User"("stravaId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Activity_userId_startDate_idx" ON "Activity"("userId", "startDate");

-- CreateIndex
CREATE INDEX "Activity_userId_sportType_idx" ON "Activity"("userId", "sportType");

-- CreateIndex
CREATE INDEX "DailyMetric_userId_date_idx" ON "DailyMetric"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_userId_date_key" ON "DailyMetric"("userId", "date");

-- CreateIndex
CREATE INDEX "WellnessReading_userId_date_source_idx" ON "WellnessReading"("userId", "date", "source");

-- CreateIndex
CREATE INDEX "Program_userId_status_idx" ON "Program"("userId", "status");

-- CreateIndex
CREATE INDEX "PlannedSession_programId_date_idx" ON "PlannedSession"("programId", "date");

-- CreateIndex
CREATE INDEX "PlannedSession_programId_weekIndex_idx" ON "PlannedSession"("programId", "weekIndex");

-- CreateIndex
CREATE INDEX "SessionAdjustment_plannedSessionId_idx" ON "SessionAdjustment"("plannedSessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRunLog_agent_createdAt_idx" ON "AIRunLog"("agent", "createdAt");

-- CreateIndex
CREATE INDEX "AIRunLog_decision_createdAt_idx" ON "AIRunLog"("decision", "createdAt");

-- AddForeignKey
ALTER TABLE "StravaToken" ADD CONSTRAINT "StravaToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityStream" ADD CONSTRAINT "ActivityStream_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySummary" ADD CONSTRAINT "ActivitySummary_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessReading" ADD CONSTRAINT "WellnessReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAdjustment" ADD CONSTRAINT "SessionAdjustment_plannedSessionId_fkey" FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRunLog" ADD CONSTRAINT "AIRunLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
