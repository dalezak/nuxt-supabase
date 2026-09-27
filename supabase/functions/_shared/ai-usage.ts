// Per-call AI usage log → `ai_usage` (tokens + estimated cost), the data
// behind "what does a course cost" and any per-user usage surface.
//
//   const result = await callClaude({...});
//   await recordAiUsage(supabaseAdmin, {
//     userId, functionName: "enrich-course", result, refType: "lesson", refId,
//   });
//
// `functionName` is the `ai_usage.function_name` key. Apps that count rows
// for a budget (enforceMonthlyBudget / enforceRateLimit) filter on it, so use
// one distinct name per call KIND — a validation pass and a generation pass
// in the same function must not share a name, or one counts as the other.
//
// Never throws: usage logging is bookkeeping and must not fail the call it
// records. Cost is an estimate from the first-party price table below (USD);
// an unknown model records tokens with a null cost rather than a wrong one.

import type { ClaudeCallResult } from "./claude.ts";

// $ per million tokens, first-party API rates. Cache reads bill at 10% of the
// input rate and cache writes at 125%. Keep in step with the model list in
// the claude-api skill / Anthropic pricing page when models change.
const PRICE_PER_MTOK: { match: RegExp; input: number; output: number }[] = [
  { match: /^claude-haiku-4-5/,  input: 1,  output: 5  },
  { match: /^claude-sonnet-5/,   input: 2,  output: 10 },
  { match: /^claude-sonnet-4-6/, input: 3,  output: 15 },
  { match: /^claude-opus-(5|4-8|4-7|4-6)/, input: 5, output: 25 },
  { match: /^claude-fable-5/,    input: 10, output: 50 },
];

export function estimateCostUsd(model: string, usage: ClaudeCallResult["usage"]): number | null {
  const price = PRICE_PER_MTOK.find(p => p.match.test(model));
  if (!price) return null;
  const perTok = (n: number, rate: number) => (n * rate) / 1_000_000;
  return perTok(usage.input_tokens, price.input)
    + perTok(usage.output_tokens, price.output)
    + perTok(usage.cache_read_input_tokens, price.input * 0.1)
    + perTok(usage.cache_creation_input_tokens, price.input * 1.25);
}

export type RecordAiUsageOptions = {
  userId: string | null | undefined;
  functionName: string;
  result: ClaudeCallResult;
  // What the call was for (e.g. "course" / "lesson") + its id — lets a
  // course's total cost be summed across its structure + lesson calls.
  refType?: string;
  refId?: string | null;
};

export async function recordAiUsage(supabaseAdmin: any, opts: RecordAiUsageOptions): Promise<void> {
  if (!opts.userId) return;
  const { model, usage } = opts.result;
  try {
    const { error } = await supabaseAdmin.from("ai_usage").insert({
      user_id: opts.userId,
      function_name: opts.functionName,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_input_tokens,
      cache_write_tokens: usage.cache_creation_input_tokens,
      cost_usd: estimateCostUsd(model, usage),
      ref_type: opts.refType ?? null,
      ref_id: opts.refId ?? null,
    });
    if (error) console.error("recordAiUsage:", error.message);
  } catch (err) {
    console.error("recordAiUsage threw:", err);
  }
}
