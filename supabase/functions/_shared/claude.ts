// Layer wrapper around the Anthropic SDK for Supabase Edge Functions.
//
// Apps pass their own prompts, model, and parsing logic; this helper handles
// client construction, API call, max_tokens detection, and text-block
// extraction. Keep prompts in the consuming app — they're domain-specific.
//
// Default model is claude-opus-4-7 (latest); callers should override per
// task (e.g. Haiku for validation, Sonnet for medium-complexity content).
//
// Thinking is opt-in via `thinking: { type: "adaptive" }` — match the
// Anthropic SDK's behavior exactly.
//
// Usage:
//   const result = await callClaude({
//     model: "claude-haiku-4-5-20251001",
//     max_tokens: 200,
//     system: "You classify topics. Reply with JSON: {\"valid\": bool}",
//     user: `Topic: "${topic}"`,
//   });
//   if (result.truncated) throw new Error("response truncated");
//   const data = parseJSON(result.text);

import Anthropic from "npm:@anthropic-ai/sdk";

export type ClaudeCallOptions = {
  model?: string;
  system: string;
  user: string;
  max_tokens?: number;
  thinking?: { type: "adaptive" | "disabled" };
  effort?: "low" | "medium" | "high" | "max" | "xhigh";
  apiKey?: string;
};

export type ClaudeCallResult = {
  text: string;
  raw: any;
  truncated: boolean;
};

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeCallResult> {
  const apiKey = options.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const anthropic = new Anthropic({ apiKey });

  const requestBody: any = {
    model: options.model ?? "claude-opus-4-7",
    max_tokens: options.max_tokens ?? 16000,
    system: options.system,
    messages: [{ role: "user", content: options.user }],
  };
  if (options.thinking) requestBody.thinking = options.thinking;
  if (options.effort) requestBody.output_config = { effort: options.effort };

  const message = await anthropic.messages.create(requestBody);

  const textBlock = message.content.find((b: any) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return {
    text,
    raw: message,
    truncated: message.stop_reason === "max_tokens",
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
