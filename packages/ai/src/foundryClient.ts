/**
 * Azure AI Foundry hosted-agent client (REST).
 *
 * Authenticates with `DefaultAzureCredential` (works with `az login`,
 * managed identity, or env-based credentials). Calls the Agents REST API:
 *   POST {projectEndpoint}/agents/{name}/invoke?api-version=2025-11-15-preview
 *
 * The actual Foundry tool-execution loop is owned by Foundry; the client
 * just submits a thread message and reads the response.
 */

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

export interface FoundryAgentClientOptions {
  projectEndpoint: string;
  agentNamePrefix: string;
  apiVersion?: string;
  credential?: TokenCredential;
}

export interface FoundryInvokeRequest {
  /** Logical agent useCaseId (e.g. "plan-generator"). Resolved to `${prefix}-${useCaseId}`. */
  useCaseId: string;
  /** User message / structured input. JSON is fine — pass as a string. */
  message: string;
  /** Conversation thread id; omit to start fresh. */
  threadId?: string;
  /** Tool definitions if you need ad-hoc tools (otherwise tools are configured server-side). */
  tools?: unknown[];
  /** Metadata to attach (logged in Foundry). */
  metadata?: Record<string, string>;
}

export interface FoundryInvokeResponse {
  threadId: string;
  outputText: string;
  toolCalls: { name: string; arguments: unknown; result?: unknown }[];
  raw: unknown;
}

export class FoundryAgentClient {
  private readonly credential: TokenCredential;
  private readonly apiVersion: string;

  constructor(private readonly opts: FoundryAgentClientOptions) {
    this.credential = opts.credential ?? new DefaultAzureCredential();
    this.apiVersion = opts.apiVersion ?? "2025-11-15-preview";
  }

  async invoke(req: FoundryInvokeRequest): Promise<FoundryInvokeResponse> {
    const token = await this.credential.getToken("https://ai.azure.com/.default");
    if (!token) throw new Error("Failed to acquire Azure AI Foundry token.");
    const agentName = `${this.opts.agentNamePrefix}-${req.useCaseId}`;
    const url = `${this.opts.projectEndpoint.replace(/\/$/, "")}/agents/${agentName}/invoke?api-version=${this.apiVersion}`;
    const body = {
      input: req.message,
      thread_id: req.threadId,
      tools: req.tools,
      metadata: req.metadata,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Foundry invoke ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      thread_id?: string;
      output_text?: string;
      tool_calls?: { name: string; arguments: unknown; result?: unknown }[];
    };
    return {
      threadId: json.thread_id ?? "",
      outputText: json.output_text ?? "",
      toolCalls: json.tool_calls ?? [],
      raw: json,
    };
  }
}
