/**
 * Azure AI Foundry hosted-agent client (REST).
 *
 * Auth: `DefaultAzureCredential` → `https://ai.azure.com/.default`.
 *
 * Foundry "prompt" agents expose the OpenAI Responses protocol at:
 *   POST {projectEndpoint}/agents/{name}/endpoint/protocols/openai/v1/responses
 *
 * Conversation continuation is via `previous_response_id` (no thread management
 * required client-side — Foundry persists state per response).
 */

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

export interface FoundryAgentClientOptions {
  projectEndpoint: string;
  agentNamePrefix: string;
  /** Reserved for future use; the Responses protocol path is fixed. */
  apiVersion?: string;
  credential?: TokenCredential;
}

export interface FoundryInvokeRequest {
  /** Logical agent useCaseId (e.g. "plan-generator"). Resolved to `${prefix}-${useCaseId}`. */
  useCaseId: string;
  /** User message / structured input. JSON is fine — pass as a string. */
  message: string;
  /** Continuation token from a prior `invoke` call (`response.id`). */
  previousResponseId?: string;
  /** Metadata to attach (logged in Foundry). */
  metadata?: Record<string, string>;
}

export interface FoundryInvokeResponse {
  /** Use as `previousResponseId` to continue the conversation. */
  responseId: string;
  outputText: string;
  toolCalls: { name: string; arguments: unknown; result?: unknown }[];
  raw: unknown;
}

interface ResponsesApiOutputItem {
  type?: string;
  text?: string;
  name?: string;
  arguments?: unknown;
  output?: unknown;
  content?: { type?: string; text?: string }[];
}

interface ResponsesApiResponse {
  id?: string;
  output_text?: string;
  output?: ResponsesApiOutputItem[];
}

export class FoundryAgentClient {
  private readonly credential: TokenCredential;

  constructor(private readonly opts: FoundryAgentClientOptions) {
    this.credential = opts.credential ?? new DefaultAzureCredential();
  }

  async invoke(req: FoundryInvokeRequest): Promise<FoundryInvokeResponse> {
    const token = await this.credential.getToken("https://ai.azure.com/.default");
    if (!token) throw new Error("Failed to acquire Azure AI Foundry token.");

    const agentName = `${this.opts.agentNamePrefix}-${req.useCaseId}`;
    const base = this.opts.projectEndpoint.replace(/\/$/, "");
    const apiVersion = this.opts.apiVersion ?? "v1";
    const url = `${base}/agents/${agentName}/endpoint/protocols/openai/responses?api-version=${apiVersion}`;

    const body: Record<string, unknown> = {
      input: req.message,
    };
    if (req.previousResponseId) body.previous_response_id = req.previousResponseId;
    if (req.metadata) body.metadata = req.metadata;

    // Retry on 429 (rate limit) and 5xx with exponential backoff.
    const maxAttempts = 4;
    let lastErrText = "";
    let lastStatus = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as ResponsesApiResponse;
        const outputText = json.output_text ?? extractOutputText(json.output);
        const toolCalls = extractToolCalls(json.output);
        return { responseId: json.id ?? "", outputText, toolCalls, raw: json };
      }
      lastStatus = res.status;
      lastErrText = await res.text();
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt === maxAttempts) break;
      // Honor Retry-After header if present, else exponential backoff.
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 30_000)
        : Math.min(2 ** attempt * 500, 8_000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Foundry invoke ${lastStatus}: ${lastErrText.slice(0, 2000)}`);
  }
}

function extractOutputText(output: ResponsesApiOutputItem[] | undefined): string {
  if (!output) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (item.type === "message" && item.content) {
      for (const c of item.content) {
        if ((c.type === "output_text" || c.type === "text") && c.text) parts.push(c.text);
      }
    } else if (item.text) {
      parts.push(item.text);
    }
  }
  return parts.join("");
}

function extractToolCalls(
  output: ResponsesApiOutputItem[] | undefined,
): { name: string; arguments: unknown; result?: unknown }[] {
  if (!output) return [];
  const calls: { name: string; arguments: unknown; result?: unknown }[] = [];
  for (const item of output) {
    if (item.type && item.type.endsWith("function_call") && item.name) {
      calls.push({ name: item.name, arguments: item.arguments, result: item.output });
    }
  }
  return calls;
}
