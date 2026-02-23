/**
 * Groq API client — fetch-based, no SDK dependency.
 *
 * Uses the Groq OpenAI-compatible chat completions REST endpoint.
 * Default: Llama 3.1 8B Instant (free tier, fast). Handles structured (JSON)
 * requests, streaming (SSE), retries, and token usage tracking.
 */

import type { StreamEvent, OperationName } from "./types.js";

export class GroqApiError extends Error {
  statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GroqApiError";
    this.statusCode = status;
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface GroqClientConfig {
  apiKey: string;
  model: string;
  maxTokensStructured: number;
  maxTokensStreaming: number;
  maxApiRetries: number;
  baseUrl: string;
}

export const DEFAULT_CONFIG: GroqClientConfig = {
  apiKey: process.env["GROQ_API_KEY"] ?? "",
  model: process.env["GROQ_MODEL"] ?? "llama-3.1-8b-instant",
  maxTokensStructured: 4096,
  maxTokensStreaming: 8192,
  maxApiRetries: 1,
  baseUrl: "https://api.groq.com/openai/v1",
};

export type FetchFn = typeof globalThis.fetch;

let _config: GroqClientConfig = { ...DEFAULT_CONFIG };
let _fetch: FetchFn = globalThis.fetch;

export function initClient(
  config: Partial<GroqClientConfig> = {},
  fetchFn?: FetchFn
): void {
  _config = { ...DEFAULT_CONFIG, ...config };
  if (fetchFn) _fetch = fetchFn;
}

export function getConfig(): GroqClientConfig { return _config; }
export function injectMockFetch(fn: FetchFn): void { _fetch = fn; }
export function resetFetch(): void { _fetch = globalThis.fetch; }

// ─── Token tracking ───────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const _usageLog: Array<{ operation: string; usage: TokenUsage; ts: string }> = [];

export function logUsage(operation: string, usage: TokenUsage): void {
  _usageLog.push({ operation, usage, ts: new Date().toISOString() });
}

export function getUsageSummary() {
  return {
    totalInputTokens: _usageLog.reduce((s, e) => s + e.usage.inputTokens, 0),
    totalOutputTokens: _usageLog.reduce((s, e) => s + e.usage.outputTokens, 0),
    calls: _usageLog.length,
  };
}

// ─── Groq REST types (OpenAI-compatible) ──────────────────────────────────────

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  max_tokens?: number;
  response_format?: { type: "json_object" };
  stream?: boolean;
  temperature?: number;
}

interface GroqResponse {
  choices: Array<{
    message: { content: string; role: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GroqStreamChunk {
  choices: Array<{
    delta: { content?: string; role?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Structured (JSON) request ────────────────────────────────────────────────

export interface StructuredRequestOptions {
  operation: OperationName;
  systemPrompt: string;
  userMessage: string;
  expectJson: true;
  maxTokens?: number;
}

export async function structuredRequest(opts: StructuredRequestOptions): Promise<string> {
  const cfg = _config;
  const url = `${cfg.baseUrl}/chat/completions`;

  const body: GroqRequest = {
    model: cfg.model,
    messages: [
      {
        role: "system",
        content: `${opts.systemPrompt}\n\nCRITICAL: Respond with ONLY valid JSON. No markdown code fences, no preamble, no explanation outside the JSON object. Your entire response must be parseable by JSON.parse().`,
      },
      {
        role: "user",
        content: opts.userMessage,
      },
    ],
    max_tokens: opts.maxTokens ?? cfg.maxTokensStructured,
    response_format: { type: "json_object" },
    temperature: 0.7,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= cfg.maxApiRetries; attempt++) {
    try {
      const response = await _fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        let parsedErrMsg = errText;
        try {
          const json = JSON.parse(errText);
          if (json?.error?.message) parsedErrMsg = json.error.message;
        } catch { }

        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new GroqApiError(response.status, `Groq API error ${response.status}: ${parsedErrMsg}`);
        }
        if ((response.status === 429 || response.status >= 500) && attempt < cfg.maxApiRetries) {
          await sleep(exponentialBackoff(attempt));
          continue;
        }

        if (response.status === 429) {
          throw new GroqApiError(429, `LLM Rate Limit Exceeded: ${parsedErrMsg}`);
        }
        throw new GroqApiError(response.status, `Groq API error ${response.status}: ${parsedErrMsg}`);
      }

      const data = await response.json() as GroqResponse;
      const text = data.choices?.[0]?.message.content ?? "";

      const usage = data.usage;
      logUsage(opts.operation, {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      });

      return cleanJson(text);

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < cfg.maxApiRetries) await sleep(exponentialBackoff(attempt));
    }
  }

  throw lastError ?? new Error("Unknown Groq API error after retries");
}

// ─── Streaming request ────────────────────────────────────────────────────────

export interface StreamingRequestOptions {
  operation: OperationName;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  onEvent: (event: StreamEvent) => void;
}

export async function streamingRequest(opts: StreamingRequestOptions): Promise<string> {
  const cfg = _config;
  const url = `${cfg.baseUrl}/chat/completions`;

  opts.onEvent({ type: "operation_start", operation: opts.operation, attempt: 1 });

  const body: GroqRequest = {
    model: cfg.model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
    max_tokens: opts.maxTokens ?? cfg.maxTokensStreaming,
    stream: true,
    temperature: 0.7,
  };

  const response = await _fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    let parsedErrMsg = errText;
    try {
      const json = JSON.parse(errText);
      if (json?.error?.message) parsedErrMsg = json.error.message;
    } catch { }

    if (response.status === 429) {
      throw new GroqApiError(429, `LLM Rate Limit Exceeded: ${parsedErrMsg}`);
    }
    throw new GroqApiError(response.status, `Groq streaming error ${response.status}: ${parsedErrMsg}`);
  }

  if (!response.body) throw new Error("Response body is null");

  let accumulated = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data) as GroqStreamChunk;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          opts.onEvent({ type: "token", delta });
        }
        const usage = chunk.usage;
        if (usage) {
          inputTokens = usage.prompt_tokens ?? inputTokens;
          outputTokens = usage.completion_tokens ?? outputTokens;
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }

  logUsage(opts.operation, {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  });

  return accumulated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function cleanJson(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from ${context}.\nParse error: ${err instanceof Error ? err.message : String(err)}\nRaw (first 500): ${raw.slice(0, 500)}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function exponentialBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 10_000) + Math.random() * 500;
}
