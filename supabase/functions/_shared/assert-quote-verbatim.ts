// assertQuoteVerbatim — verify that a quote produced by an LLM is a
// LITERAL substring of the source text the model was given. The
// editorial primitive behind features that surface user-authored
// quotes back to the user: paraphrase silently rewords what the user
// wrote, and that turns "witness" into "summary" — the exact failure
// mode the verbatim discipline guards against.
//
// Two call modes:
//   - `assertQuoteVerbatim(quote, source)` — throws on failure (use at
//     the EF boundary when you want a 502 to surface to the client)
//   - `assertQuoteVerbatim(quote, source, { strict: false })` — returns
//     a boolean (use for soft checks / logging)
//
// Normalizes whitespace differences (collapses runs of \s into single
// spaces) before comparing. The intent is to catch *paraphrase*, not
// trailing-whitespace mismatches that don't change meaning. If your
// callers need character-perfect including whitespace, pass
// `{ collapseWhitespace: false }`.
//
// Trims leading/trailing whitespace on the quote by default — LLMs
// often include a stray newline that the user wouldn't notice but
// would otherwise fail the substring check.
//
// Empty / nullish quote returns false (or throws) — an empty match is
// never meaningful even though every string trivially contains the
// empty string.

export type AssertQuoteVerbatimOptions = {
  strict?: boolean;
  collapseWhitespace?: boolean;
  trimQuote?: boolean;
};

const DEFAULT_OPTIONS: Required<AssertQuoteVerbatimOptions> = {
  strict: true,
  collapseWhitespace: true,
  trimQuote: true,
};

function normalize(text: string, collapse: boolean): string {
  if (!collapse) return text;
  return text.replace(/\s+/g, " ");
}

export function assertQuoteVerbatim(
  quote: string | null | undefined,
  source: string | null | undefined,
  options: AssertQuoteVerbatimOptions = {},
): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const q = opts.trimQuote ? String(quote ?? "").trim() : String(quote ?? "");
  const s = String(source ?? "");
  const ok =
    q.length > 0 &&
    normalize(s, opts.collapseWhitespace).includes(normalize(q, opts.collapseWhitespace));
  if (!ok && opts.strict) {
    throw new Error("assertQuoteVerbatim: quote is not a verbatim substring of source");
  }
  return ok;
}
