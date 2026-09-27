// Layer helpers for Supabase Edge Functions: CORS, auth verification,
// JSON responses, and a serve() wrapper that handles OPTIONS + try/catch.
//
// These are framework-shaped, not Anthropic-specific. Use them from any
// edge function that needs auth + CORS, regardless of whether it calls
// Claude.
//
// Usage:
//   serveEdge(async (req) => {
//     const auth = await verifyAuth(req);
//     if (!auth.ok) return auth.response;
//     const { user, supabaseAdmin } = auth;
//     ...
//     return jsonResponse({ id: course.id });
//   });

import { createClient } from "npm:@supabase/supabase-js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

export type AuthOk = {
  ok: true;
  user: any;
  supabaseAdmin: any;
  supabaseUser: any;
};

export type AuthFail = {
  ok: false;
  response: Response;
};

// Verify the request was made server-to-server with the SERVICE_ROLE key.
// Use this in Edge Functions that should NEVER be called by user clients —
// e.g. push dispatchers and scheduled-cron handlers. Returns either an
// admin Supabase client + ok: true, or a 401 Response to early-return.
export type ServiceRoleOk = {
  ok: true;
  supabaseAdmin: any;
};

// Constant-time string compare for secrets (a plain `!==` short-circuits on
// the first differing byte, which leaks the prefix length over timing).
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function verifyServiceRole(req: Request): ServiceRoleOk | AuthFail {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!timingSafeEqual(auth, `Bearer ${serviceKey}`)) {
    return { ok: false, response: errorResponse("Unauthorized", 401) };
  }
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  return { ok: true, supabaseAdmin };
}

// Verify the request's Authorization header. On success returns Supabase
// clients (admin = service role, user = scoped to caller's JWT) plus the
// authenticated user. On failure returns a 401 Response — caller should
// early-return it.
export async function verifyAuth(req: Request): Promise<AuthOk | AuthFail> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: errorResponse("Missing authorization header", 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) {
    return { ok: false, response: errorResponse("Unauthorized", 401) };
  }

  return { ok: true, user, supabaseAdmin, supabaseUser };
}

// Enforce a per-user-per-day rate limit on calls to a named function via
// the `ai_usage` log. Returns a 429 Response when exceeded (caller should
// early-return it), or null to proceed. Always inserts the usage row on
// success — counts cost regardless of whether the downstream AI call
// succeeds, so failed-but-attempted requests still count.
//
// Usage:
//   const limited = await enforceRateLimit(supabaseAdmin, user.id, FUNCTION_NAME, 30);
//   if (limited) return limited;
//
// Caller customises the user-facing 429 message via the optional 4th arg.
//
// ── THE WINDOW IS A CALENDAR DAY, IN THE USER'S TIMEZONE ─────────────────────
// It used to be a rolling 24 hours, which is a defensible cap and a terrible
// promise: every message the user is shown says the limit "resets in the
// morning", and under a rolling window nothing happens in the morning. Hit the
// cap at 21:40 and you get one message back at 21:40 the next EVENING. Someone
// who reads the alert, waits until breakfast and finds themselves still blocked
// has been told something untrue by their own app.
//
// A day also just means more to a person than a trailing window. "25 a day"
// that turns out to mean "25 in any 24 hours" is the kind of surprise that
// reads as the product being sly about it.
//
// Timezone comes from `notifications.timezone`, the same source the paced
// learning and week-strip day boundaries use, so "today" means one thing across
// the whole app. No row, or an unusable zone, falls back to UTC midnight —
// still a calendar day, just not the user's.
// The instant the user's current local day began, as an ISO string.
//
// Deriving it via `Intl` rather than a date library: read the wall clock in the
// target zone, measure how far that is from true UTC, and shift local midnight
// by the same amount. That handles DST without a table, because the offset is
// measured at the moment in question rather than assumed.
export async function startOfUserDay(supabaseAdmin: any, userId: string): Promise<string> {
  let zone = "UTC";
  try {
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.timezone) zone = data.timezone;
  } catch {
    // A failed preferences read must never block the call it is gating.
  }
  try {
    const now = new Date();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).formatToParts(now).map((p) => [p.type, p.value]),
    ) as Record<string, string>;

    const wall = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day,
      +parts.hour, +parts.minute, +parts.second,
    );
    // Sub-second noise only — the wall clock is read to the second.
    const offset = Math.round((wall - now.getTime()) / 1000) * 1000;
    const midnight = Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, 0, 0);
    return new Date(midnight - offset).toISOString();
  } catch {
    // An unrecognised IANA zone throws in Intl. Fall back to UTC midnight.
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
  }
}

export async function enforceRateLimit(
  supabaseAdmin: any,
  userId: string,
  functionName: string,
  perDay: number,
  errorMessage = "Daily limit reached. Try again tomorrow.",
): Promise<Response | null> {
  const cutoff = await startOfUserDay(supabaseAdmin, userId);
  const { count } = await supabaseAdmin
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("function_name", functionName)
    .gte("created_at", cutoff);
  if ((count ?? 0) >= perDay) {
    return errorResponse(errorMessage, 429);
  }
  await supabaseAdmin
    .from("ai_usage")
    .insert({ user_id: userId, function_name: functionName });
  return null;
}

// Count-only daily cap: 429 when the user already has `perDay` `ai_usage`
// rows under `functionName` in the last 24h. Unlike enforceRateLimit it does
// NOT insert — pair it with recordAiUsage, which writes the row (with tokens
// and cost) after the call, so the cap and the cost log share one row.
export async function enforceDailyCap(
  supabaseAdmin: any,
  userId: string,
  functionName: string,
  perDay: number,
  errorMessage = "Daily limit reached. Try again tomorrow.",
): Promise<Response | null> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("function_name", functionName)
    .gte("created_at", cutoff);
  if ((count ?? 0) >= perDay) return errorResponse(errorMessage, 429);
  return null;
}

// Enforce a per-user-per-calendar-month AI budget across ALL functions for
// a user. Counts every row in `ai_usage` for the user since the start of
// the current month (UTC), regardless of `function_name`. The budget is a
// plan-level total — caller resolves it from the user's plan
// (e.g. `plans[user.subscription_status].ai_per_month`) and passes the
// number in.
//
// Unlike `enforceRateLimit`, this does NOT insert a usage row — it only
// checks. Pair with a separate `enforceRateLimit` call (which inserts) or
// an explicit insert. The split keeps the two concerns independent: a
// function can have a per-day cap AND share a per-month plan budget.
//
// Usage:
//   const overBudget = await enforceMonthlyBudget(supabaseAdmin, user.id, plan.ai_per_month);
//   if (overBudget) return overBudget;
//   const limited = await enforceRateLimit(supabaseAdmin, user.id, FUNCTION_NAME, 30);
//   if (limited) return limited;
//
// `functionName` narrows the count to one `function_name`. Now that every AI
// call logs a row (recordAiUsage in ai-usage.ts — enrich, distill, grading…),
// a budget that means "courses per month" must count only the generation rows,
// not every call the course went on to make.
export async function enforceMonthlyBudget(
  supabaseAdmin: any,
  userId: string,
  perMonth: number,
  errorMessage = "Monthly AI limit reached. Upgrade your plan for more.",
  functionName: string | null = null,
): Promise<Response | null> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  let query = supabaseAdmin
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart);
  if (functionName) query = query.eq("function_name", functionName);
  const { count } = await query;
  if ((count ?? 0) >= perMonth) {
    return errorResponse(errorMessage, 429);
  }
  return null;
}

// Run `fn` over `items` with at most `limit` in flight, never rejecting: a
// failed item logs and yields null so one bad push (a non-JSON error page, a
// throttled invocation) can't reject the whole batch. For the notify
// dispatchers, which used to `Promise.all` one fetch per recipient — 800 due
// reminders meant 800 concurrent invocations, and a single failure lost the
// entire run after the picker had already marked everything sent.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (err) {
        console.error("mapWithConcurrency: item failed", err);
        out[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

// Wrap an Edge Function handler with CORS preflight + try/catch error
// handling. Thrown errors become 500 JSON responses; the handler can still
// return its own status codes via jsonResponse / errorResponse.
export function serveEdge(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      return await handler(req);
    } catch (error) {
      // Log the detail, return a generic message: an uncaught Postgres or SDK
      // error carries constraint / column names the client has no use for.
      console.error("edge function error:", error);
      return errorResponse("Something went wrong. Please try again.");
    }
  });
}
