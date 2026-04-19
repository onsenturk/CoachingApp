/**
 * Agent governance wrapper (G3).
 *
 * Every Foundry agent tool call goes through `govern()`. Fails closed.
 *
 * Policy is loaded from `policy.yaml` next to this file at process startup.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export type GovernDecision = "allow" | "deny" | "error";

export interface GovernResult {
  decision: GovernDecision;
  reason?: string;
  matchedPatternId?: string;
}

export interface GovernInput {
  agent: string;
  tool: string;
  /** JSON-serializable arguments the agent wants to pass to the tool. */
  args: unknown;
  /** Optional original user message — also scanned for blocked patterns. */
  userInput?: string;
}

interface PolicyFile {
  version: number;
  blocked_patterns: { id: string; pattern: string }[];
  agents: Record<
    string,
    { description: string; allowed_tools: string[]; max_calls_per_run: number }
  >;
}

interface CompiledPolicy {
  raw: PolicyFile;
  blockedPatterns: { id: string; re: RegExp }[];
}

let cachedPolicy: CompiledPolicy | null = null;

export function loadPolicy(policyPath?: string): CompiledPolicy {
  if (cachedPolicy && !policyPath) return cachedPolicy;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const resolved = policyPath ?? path.join(here, "policy.yaml");
  const raw = YAML.parse(fs.readFileSync(resolved, "utf-8")) as PolicyFile;
  const compiled: CompiledPolicy = {
    raw,
    blockedPatterns: raw.blocked_patterns.map((p) => ({ id: p.id, re: compilePattern(p.pattern) })),
  };
  if (!policyPath) cachedPolicy = compiled;
  return compiled;
}

/** Translate `(?i)` / `(?m)` / `(?s)` inline flag prefixes to JS RegExp flags. */
function compilePattern(pattern: string): RegExp {
  let flags = "";
  let body = pattern;
  const m = body.match(/^\(\?([imsux]+)\)/);
  if (m) {
    body = body.slice(m[0].length);
    for (const c of m[1]!) {
      if ("ims".includes(c) && !flags.includes(c)) flags += c;
    }
  }
  return new RegExp(body, flags);
}

/** Per-run call counter shared across `govern()` invocations within one agent run. */
export class RunCounter {
  private counts = new Map<string, number>();
  inc(agent: string): number {
    const next = (this.counts.get(agent) ?? 0) + 1;
    this.counts.set(agent, next);
    return next;
  }
  get(agent: string): number {
    return this.counts.get(agent) ?? 0;
  }
}

/** Audit log writer (caller injects). NEVER log raw user content. */
export type AuditWriter = (entry: {
  agent: string;
  tool: string;
  decision: GovernDecision;
  reason?: string;
  policyName?: string;
  evidenceJson?: unknown;
}) => Promise<void>;

export interface GovernConfig {
  runCounter: RunCounter;
  audit: AuditWriter;
  policyPath?: string;
}

export async function govern(input: GovernInput, cfg: GovernConfig): Promise<GovernResult> {
  const policy = loadPolicy(cfg.policyPath);
  const agentPolicy = policy.raw.agents[input.agent];

  // Fail-closed if agent not registered
  if (!agentPolicy) {
    const result: GovernResult = {
      decision: "deny",
      reason: `Agent '${input.agent}' not in policy (fail-closed).`,
    };
    await cfg.audit({ agent: input.agent, tool: input.tool, decision: "deny", reason: result.reason, policyName: "fail_closed" });
    return result;
  }

  // Tool allowlist
  if (!agentPolicy.allowed_tools.includes(input.tool)) {
    const reason = `Tool '${input.tool}' not allowed for agent '${input.agent}'.`;
    await cfg.audit({ agent: input.agent, tool: input.tool, decision: "deny", reason, policyName: "tool_allowlist" });
    return { decision: "deny", reason };
  }

  // Rate / loop limit
  const calls = cfg.runCounter.inc(input.agent);
  if (calls > agentPolicy.max_calls_per_run) {
    const reason = `Exceeded max ${agentPolicy.max_calls_per_run} tool calls per run.`;
    await cfg.audit({ agent: input.agent, tool: input.tool, decision: "deny", reason, policyName: "rate_limit" });
    return { decision: "deny", reason };
  }

  // Pattern scan on args + optional userInput
  const haystack = [
    typeof input.args === "string" ? input.args : JSON.stringify(input.args),
    input.userInput ?? "",
  ].join("\n");
  for (const p of policy.blockedPatterns) {
    if (p.re.test(haystack)) {
      const reason = `Blocked pattern '${p.id}' matched.`;
      await cfg.audit({
        agent: input.agent,
        tool: input.tool,
        decision: "deny",
        reason,
        policyName: "blocked_pattern",
        // Log only the pattern id — never the matched user text.
        evidenceJson: { matchedPatternId: p.id },
      });
      return { decision: "deny", reason, matchedPatternId: p.id };
    }
  }

  await cfg.audit({ agent: input.agent, tool: input.tool, decision: "allow", policyName: "pass" });
  return { decision: "allow" };
}
