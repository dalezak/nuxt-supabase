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
