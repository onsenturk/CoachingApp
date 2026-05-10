# Application Stack And Requirements

This document captures the current CoachingApp application stack and the functional and non-functional requirements the codebase is designed to satisfy. It is grounded in the repository structure, package manifests, Prisma schema, worker entrypoint, and key API routes.

## Product Scope

CoachingApp is an AI-assisted endurance coaching application for runners and cyclists. It imports Strava activity history, computes deterministic training-science metrics, generates periodized plans through governed Azure AI Foundry agents, and presents a calendar, dashboard, activity history, and daily readiness check-in.

The application does not put a human coach in the loop. AI-generated plans and summaries must pass schema validation, governance checks, and physiological guardrails before they are accepted by the system.

## Application Stack

| Layer | Technology | Current Version / Detail | Responsibility |
| --- | --- | --- | --- |
| Monorepo | pnpm workspaces | pnpm 11.0.9 | Coordinates `apps/*` and `packages/*` packages. |
| Runtime | Node.js | Engine `>=22.12.0` | Runs the Next.js app, worker, scripts, and tests. |
| Web app | Next.js App Router | Next.js 16.2.6 | Authenticated UI, route handlers, server components, API endpoints. |
| UI runtime | React | React 19.2.6, React DOM 19.2.6 | Interactive coach form, navigation tabs, completion actions. |
| Styling | Tailwind CSS | Tailwind 3.4.19 | Utility CSS for the web UI. |
| Auth | NextAuth/Auth.js | next-auth 5.0.0-beta.31 | Strava OAuth sign-in and authenticated sessions. |
| Database ORM | Prisma | Prisma 5.22.0 | Schema, generated client, migrations, typed database access. |
| Database | PostgreSQL | Local Docker image `postgres:16-alpine` | Stores users, activities, programs, planned sessions, wellness data, and audit logs. |
| Queue | Redis | Local Docker image `redis:7-alpine` | BullMQ job transport and persistence. |
| Worker | BullMQ | BullMQ 5.76.6, ioredis 5.10.1 | Processes Strava sync, training-load recalculation, and activity summaries. |
| AI platform | Azure AI Foundry | Configured by environment and `agents/foundry-agents.json` | Hosts plan-generation, adjustment, and summary agents. |
| AI client and governance | `@coaching/ai` | Azure Identity 4.13.1, Zod 3.25.76, YAML 2.8.4 | Foundry REST calls, policy loading, schema validation, tool governance, audit writing. |
| Training science | `@coaching/training` | TypeScript package | TRIMP, TSS, CTL/ATL/TSB, readiness, zones, target paces, race predictions, plan rules. |
| Strava integration | `@coaching/strava` | TypeScript package | Typed Strava client and rate limiting. |
| Secret protection | libsodium | libsodium-wrappers 0.7.15 | Encrypts Strava OAuth tokens at rest. |
| Test runner | Vitest | Vitest 4.1.5 | Unit tests for governance and training-science rules. |
| Type checking | TypeScript | TypeScript 5.9.3 | Static checking across apps and packages. |

## Runtime Components

| Component | Path | Responsibilities |
| --- | --- | --- |
| Web application | `apps/web` | Landing page, Strava auth, dashboard, activity history, calendar, coach flow, profile, check-in, and API route handlers. |
| Worker process | `apps/worker` | Starts BullMQ workers for `strava-sync`, `training-load`, and `activity-summary`. |
| Database package | `packages/db` | Prisma schema and database client export. |
| AI package | `packages/ai` | Foundry client, agent governance, schemas, and AI policy. |
| Training package | `packages/training` | Deterministic training calculations and plan validation. |
| Strava package | `packages/strava` | External Strava API access and rate-limit management. |
| Foundry agent manifest | `agents/foundry-agents.json` | Local source of truth for hosted Foundry agent definitions. |
| Local infrastructure | `docker-compose.yml` | Local PostgreSQL and Redis services. |

## Functional Requirements

| ID | Requirement | Current Implementation Evidence | Priority |
| --- | --- | --- | --- |
| FR-001 | Users can authenticate with Strava OAuth. | `apps/web/src/auth.ts`, `apps/web/src/app/api/auth/[...nextauth]/route.ts` | Must |
| FR-002 | The system stores user identity and athlete profile details. | `User` model in `packages/db/prisma/schema.prisma` | Must |
| FR-003 | The system stores encrypted Strava access and refresh tokens. | `StravaToken` model and encrypted token fields in `packages/db/prisma/schema.prisma`; crypto helpers in app and worker packages | Must |
| FR-004 | Users can sync Strava activities and activity streams. | `apps/web/src/app/api/strava/sync/route.ts`; `apps/worker/src/jobs/stravaSync.ts` | Must |
| FR-005 | The system stores activity metrics including sport type, time, distance, heart rate, power, cadence, TSS, and TRIMP. | `Activity` and `ActivityStream` models | Must |
| FR-006 | Users can view a dashboard with latest sync state, training load, race predictions, activity visuals, today's session, and recent activities. | `apps/web/src/app/dashboard/page.tsx` | Must |
| FR-007 | Users can complete a daily readiness check-in. | `apps/web/src/app/checkin/page.tsx`; `DailyMetric` and `WellnessReading` models | Must |
| FR-008 | The app computes deterministic training metrics such as TRIMP, TSS, CTL, ATL, TSB, readiness, zones, paces, and race predictions. | `packages/training/src/*`; tests in `packages/training/test` | Must |
| FR-009 | Users can generate a periodized training plan from goal inputs and recent activity history. | `apps/web/src/app/api/program/generate/route.ts`; `apps/web/src/app/coach/GoalForm.tsx` | Must |
| FR-010 | AI-generated plans must pass schema validation and physiological validation before persistence. | `PlanGeneratorOutputSchema`; `rules.validatePlan`; plan generation route | Must |
| FR-011 | If the first generated plan violates physiological rules, the system runs one corrective second iteration and warns the user when the retry succeeds. | `apps/web/src/app/api/program/generate/route.ts`; safety warning in `apps/web/src/app/calendar/page.tsx` | Must |
| FR-012 | Users must explicitly approve replacing an existing active plan before a new active plan is created. | `replaceActiveProgram` in `GoalInputSchema`; 409 approval guard in plan generation route; coach form confirmation checkbox | Must |
| FR-013 | The calendar shows sessions from the latest active plan only. | `apps/web/src/app/calendar/page.tsx` scopes planned sessions by latest active `programId` | Must |
| FR-014 | Users can view full plan details, workout structure, target pace, target power, warm-up, cooldown, and intervals. | `apps/web/src/components/PlannedSessionCard.tsx` | Must |
| FR-015 | Users can mark today's planned session as complete. | `apps/web/src/components/SessionCompletionActions.tsx`; `apps/web/src/app/api/planned-sessions/[id]/complete/route.ts` | Should |
| FR-016 | Users can trigger Strava sync and match a planned session to a completed activity. | `SessionCompletionActions`; `apps/web/src/app/api/planned-sessions/[id]/match-activity/route.ts`; `apps/web/src/lib/activitySessionMatching.ts` | Should |
| FR-017 | Users can view activity details for runs and rides including pace, speed, calories, heart rate, power, cadence, and AI summaries when available. | `apps/web/src/components/ActivityDetailCard.tsx`; `ActivitySummary` model | Must |
| FR-018 | Users can filter activity history by synced sport type. | `apps/web/src/app/activities/page.tsx` | Should |
| FR-019 | Workout pace displays include both min/km and km/h for treadmill use. | `apps/web/src/components/PlannedSessionCard.tsx`; `GoalForm` pace preview | Should |
| FR-020 | Foundry agents can be synced from a local manifest. | `agents/foundry-agents.json`; `scripts/sync-foundry-agents.ps1`; root `agents:sync` script | Must for AI features |
| FR-021 | AI calls are audited without storing user prompt content. | `AIRunLog` model; `audit` writer in plan generation route; governance instructions | Must |

## Non-Functional Requirements

| ID | Category | Requirement | Current Controls / Implementation | Verification |
| --- | --- | --- | --- | --- |
| NFR-001 | Security | All authenticated user data access must be scoped to the signed-in user. | API routes derive `userId` from `auth()` and query by ownership relations. | Code review and route tests where added. |
| NFR-002 | Security | Strava tokens must be encrypted at rest and never logged in plaintext. | `StravaToken` stores encrypted bytes; libsodium is used by app and worker crypto helpers. | Manual review and secret scanning before commit. |
| NFR-003 | Security | AI agent actions must fail closed when governance, schema validation, or physiological validation fails. | `govern()`, Zod schemas, deterministic `rules.validatePlan`, and retry/fail logic in plan generation. | Unit tests for governance and rules; API error handling review. |
| NFR-004 | Security | Audit logs must capture decisions and metadata without storing user content. | `AIRunLog` stores agent, tool, decision, policy, reason, and evidence metadata. | Review audit writes before new AI features ship. |
| NFR-005 | Privacy | The v1 product must avoid medical, nutritional, or pharmacological advice. | Documented non-goal; agent governance and product copy should keep this boundary. | Prompt and policy review. |
| NFR-006 | Reliability | Local development must run with reproducible services. | Docker Compose provides PostgreSQL on host port 5433 and Redis on 6379. | `docker compose up -d` and healthchecks. |
| NFR-007 | Reliability | Background work must be isolated from request/response paths where practical. | BullMQ worker processes Strava sync, training load, and activity summaries. | Worker logs and queue inspection. |
| NFR-008 | Reliability | Plan replacement must be atomic. | Plan persistence runs inside a Prisma transaction that archives prior active programs and creates the new plan and sessions. | Typecheck, build, and integration testing. |
| NFR-009 | Performance | Dashboard and activity pages should bound query sizes for common views. | Recent activities use limited queries; activities page uses pagination with page size 50. | Query review and page load monitoring. |
| NFR-010 | Performance | Long-running AI generation should provide progress feedback and avoid duplicate user action. | `GoalForm` displays progress state and disables submission while pending. | Browser/manual UX check. |
| NFR-011 | Maintainability | Training science must remain deterministic, testable, and isolated from UI and AI code. | `packages/training` is a pure TypeScript package with unit tests. | `pnpm -r test`. |
| NFR-012 | Maintainability | Shared UI patterns should be componentized rather than duplicated across pages. | Shared `Button`, `AppNavTabs`, `PlannedSessionCard`, `ActivityDetailCard`, and `SessionCompletionActions`. | Component review. |
| NFR-013 | Maintainability | AI schemas and route payloads should be validated at the boundary. | `@coaching/ai` Zod schemas validate goal inputs and agent outputs. | Typecheck and schema tests. |
| NFR-014 | Observability | Worker job failures and completions should be visible during local operation. | Worker entrypoint logs completed and failed BullMQ jobs. | Terminal logs. |
| NFR-015 | Compatibility | The repo should use current supported runtime and framework versions. | Node engine `>=22.12.0`, pnpm 11.0.9, Next.js 16.2.6, React 19.2.6. | `package.json` and build validation. |
| NFR-016 | Usability | The primary authenticated navigation must be visually discoverable. | `AppNavTabs` provides tab-like navigation across dashboard, check-in, calendar, coach, activities, and profile. | Browser/manual UX check. |
| NFR-017 | Usability | Fitness, plan, and activity metrics must use athlete-friendly units. | Pace, speed, distance, time, HR, power, TSS/TRIMP, and km/h treadmill pace are displayed. | UI review. |
| NFR-018 | Testability | Core rules and governance behavior must be covered by automated tests. | Vitest suites in `packages/training/test` and `packages/ai/test`. | `pnpm -r test`. |

## Current Known Constraints

- Strava is the only v1 activity data source.
- Strava does not provide HRV, sleep, or recovery data, so the app uses manual check-ins and adapter-ready wellness models.
- Planned workouts are kept in-app; Strava does not support pushing planned workouts through this integration.
- AI features require a configured Azure AI Foundry project and synced agent definitions.
- Local development depends on Docker for PostgreSQL and Redis.

## Validation Commands

Use these commands after changing stack, requirements, or behavior that supports the requirements above:

```bash
npx pnpm@11.0.9 --filter @coaching/web typecheck
npx pnpm@11.0.9 --filter @coaching/web build
npx pnpm@11.0.9 -r test
```

## Sources

- [README.md](../README.md)
- [package.json](../package.json)
- [apps/web/package.json](../apps/web/package.json)
- [apps/worker/package.json](../apps/worker/package.json)
- [packages/ai/package.json](../packages/ai/package.json)
- [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma)
- [docker-compose.yml](../docker-compose.yml)
- [apps/web/src/app/api/program/generate/route.ts](../apps/web/src/app/api/program/generate/route.ts)
- [apps/worker/src/index.ts](../apps/worker/src/index.ts)