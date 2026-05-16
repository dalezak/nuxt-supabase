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

export function verifyServiceRole(req: Request): ServiceRoleOk | AuthFail {
  const auth = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
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
export async function enforceRateLimit(
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
  if ((count ?? 0) >= perDay) {
    return errorResponse(errorMessage, 429);
  }
  await supabaseAdmin
    .from("ai_usage")
    .insert({ user_id: userId, function_name: functionName });
  return null;
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
      console.error("edge function error:", error);
      return errorResponse(error instanceof Error ? error.message : "Unknown error");
    }
  });
}
