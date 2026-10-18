// Layer wrapper around the Anthropic SDK for Supabase Edge Functions.
//
// Apps pass their own prompts, model, and parsing logic; this helper handles
// client construction, API call, max_tokens detection, and text-block
// extraction. Keep prompts in the consuming app — they're domain-specific.
//
// Default model is claude-opus-5 (latest); callers should override per
// task (e.g. Haiku for validation, Sonnet for medium-complexity content).
//
// Thinking is opt-in via `thinking: { type: "adaptive" }` — match the
// Anthropic SDK's behavior exactly. `effort` tunes how much a thinking model
// reasons (Sonnet 5 / Opus 5 think by default — pass `effort: "low"` for
// bulk content generation where reasoning adds cost, not quality).
//
// `format` — a JSON schema for structured outputs (`output_config.format`):
// the response text is then guaranteed to parse and match the schema, so
// callers can drop their retry-on-invalid-JSON paths. Every object needs
// `additionalProperties: false`; see the Anthropic structured-outputs docs
// for the supported subset.
//
// `cacheSystem` — wraps the system prompt in a cache_control block so a
// prompt reused across calls (a per-lesson generator) is billed at the
// cache-read rate after the first call. Only effective above the model's
// minimum cacheable prefix (1024 tokens on Sonnet 5 / Opus 5, 4096 on
// Haiku 4.5) — below it the flag is harmless but does nothing.
//
// The result carries `usage` (token counts, cache read/write) and the model
// actually used, so callers can record cost — see ai-usage.ts.
//
// Two calling styles, pick whichever fits:
//
// 1. Single-shot — pass `user` as a string. The helper wraps it as one
//    user message:
//
//      callClaude({ system: "...", user: `Topic: "${topic}"` });
//
// 2. Multi-turn — pass `messages` directly. Required for conversational
//    history (e.g. coaching chat) so the SDK sees proper alternating
//    user/assistant turns. Must end with a `user` role so the model can
//    respond:
//
//      callClaude({ system: "...", messages: [
//        { role: "user", content: "..." },
//        { role: "assistant", content: "..." },
//        { role: "user", content: "..." },
//      ]});
//
// Exactly one of `user` / `messages` must be set.

import Anthropic from "npm:@anthropic-ai/sdk";
import { errorResponse } from "./edge.ts";

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeCallOptions = {
  model?: string;
  system: string;
  // Provide EITHER `user` (single-shot) OR `messages` (multi-turn).
  user?: string;
  messages?: ClaudeMessage[];
  max_tokens?: number;
  thinking?: { type: "adaptive" | "disabled" };
  effort?: "low" | "medium" | "high" | "max" | "xhigh";
  // JSON schema for structured outputs (output_config.format).
  format?: Record<string, unknown>;
  // Cache the system prompt across calls (prompt caching).
  cacheSystem?: boolean;
  apiKey?: string;
};

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type ClaudeCallResult = {
  text: string;
  raw: any;
  truncated: boolean;
  model: string;
  usage: ClaudeUsage;
};

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const { anthropic, requestBody, model } = prepareRequest(options);
  const message = await anthropic.messages.create(requestBody);
  return toResult(message, model);
}

// Streaming twin of `callClaude`: `onText` receives each text delta as it
// arrives, and the promise resolves to the same `ClaudeCallResult` once the
// message is complete — so a caller can show the reply live and still persist,
// check truncation and record usage exactly as it would after `callClaude`.
// `onText` is called synchronously from the SDK's event loop; keep it cheap
// (enqueue to a stream, don't await work in it).
export async function streamClaude(
  options: ClaudeCallOptions,
  onText: (delta: string) => void,
): Promise<ClaudeCallResult> {
  const { anthropic, requestBody, model } = prepareRequest(options);
  const stream = anthropic.messages.stream(requestBody);
  stream.on("text", (delta: string) => onText(delta));
  const message = await stream.finalMessage();
  return toResult(message, model);
}

function prepareRequest(options: ClaudeCallOptions) {
  const apiKey = options.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Build the messages array — single-shot wraps `user`; multi-turn passes
  // through. Caller must provide one or the other.
  let messages: ClaudeMessage[];
  if (options.messages && options.messages.length > 0) {
    messages = options.messages;
  } else if (typeof options.user === "string") {
    messages = [{ role: "user", content: options.user }];
  } else {
    throw new Error("callClaude requires either `user` (single-shot) or `messages` (multi-turn)");
  }

  const anthropic = new Anthropic({ apiKey });

  const model = options.model ?? "claude-opus-5";
  const requestBody: any = {
    model,
    max_tokens: options.max_tokens ?? 16000,
    system: options.cacheSystem
      ? [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }]
      : options.system,
    messages,
  };
  if (options.thinking) requestBody.thinking = options.thinking;
  if (options.effort || options.format) {
    requestBody.output_config = {
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.format ? { format: { type: "json_schema", schema: options.format } } : {}),
    };
  }

  return { anthropic, requestBody, model };
}

function toResult(message: any, model: string): ClaudeCallResult {
  const textBlock = message.content.find((b: any) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const u: any = message.usage ?? {};

  return {
    text,
    raw: message,
    truncated: message.stop_reason === "max_tokens",
    model: message.model ?? model,
    usage: {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}

// Strip ```json fences and parse JSON. Throws on invalid JSON — caller
// should wrap in try/catch when handling untrusted/partial output.
export function parseJSON<T = any>(text: string): T {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped);
}

// Call Claude expecting a JSON response, then handle the two failure modes
// (truncated response + invalid JSON) as 502 Responses ready for the caller
// to early-return. Bundles `callClaude` + truncation guard + `parseJSON` +
// log-and-return-502 on parse error — the boilerplate every JSON-output
// Edge Function repeats verbatim.
//
// Return is a union: parsed data on success, Response on either error. The
// caller can branch with `instanceof Response`:
//
//   const result = await callClaudeJSON<MyShape>(options, "my-function");
//   if (result instanceof Response) return result;
//   // result is MyShape here — narrowed by the type guard
//
// `errorContext` is logged with the raw text on parse failures (defaults
// to "callClaudeJSON" — pass the function name for traceability).
export async function callClaudeJSON<T = any>(
  options: ClaudeCallOptions,
  errorContext = "callClaudeJSON",
): Promise<T | Response> {
  const result = await callClaude(options);

  if (result.truncated) {
    return errorResponse("AI response truncated.", 502);
  }

  try {
    return parseJSON<T>(result.text);
  } catch (_) {
    console.error(`${errorContext} parse error:`, result.text);
    return errorResponse("AI returned invalid JSON. Please try again.", 502);
  }
}
