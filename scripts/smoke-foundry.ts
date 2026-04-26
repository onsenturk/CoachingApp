/**
 * Smoke test: directly invoke the plan-generator agent in Foundry.
 *
 * Requires: az login (DefaultAzureCredential picks up AzureCliCredential).
 * Reads:    AZURE_FOUNDRY_PROJECT_ENDPOINT, AZURE_FOUNDRY_AGENT_PREFIX
 *
 * Run with: pnpm tsx scripts/smoke-foundry.ts
 */
import { FoundryAgentClient } from "../packages/ai/src/foundryClient";

async function main() {
  const endpoint = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT;
  const prefix = process.env.AZURE_FOUNDRY_AGENT_PREFIX ?? "coaching";
  if (!endpoint) throw new Error("AZURE_FOUNDRY_PROJECT_ENDPOINT not set");

  const client = new FoundryAgentClient({
    projectEndpoint: endpoint,
    agentNamePrefix: prefix,
  });

  console.log(`Invoking ${prefix}-plan-generator @ ${endpoint} ...`);
  const t0 = Date.now();
  const out = await client.invoke({
    useCaseId: "plan-generator",
    message: JSON.stringify({
      goalType: "5k",
      targetTimeSeconds: 1500,
      eventDate: "2026-08-15",
      currentWeeklyKm: 25,
      restDays: ["Monday"],
    }),
    metadata: { test: "smoke" },
  });
  const dt = Date.now() - t0;

  console.log(`responseId: ${out.responseId}`);
  console.log(`elapsed:    ${dt}ms`);
  console.log(`outputText (first 500 chars):\n${out.outputText.slice(0, 500)}`);
  console.log(`\nfull length: ${out.outputText.length} chars`);
  if (out.toolCalls.length > 0) console.log(`tool calls: ${out.toolCalls.length}`);
}

main().catch((e) => {
  console.error("SMOKE FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
