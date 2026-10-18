// account-data — the two account-data rights every store-listed app owes its
// users: take everything with you (export), and remove everything (delete).
// Apple Guideline 5.1.1(v), Google's User Data policy, GDPR Articles 17 + 20.
//
// The layer ships the LOGIC; each app owns its entry points, the same split
// as the conversation and journal handlers. An app's function is a wrapper:
//
//   // supabase/functions/delete-user-account/index.ts
//   import { handleDeleteUserAccount } from "../_shared/account-data.ts";
//   import { serveEdge } from "../_shared/edge.ts";
//   serveEdge(handleDeleteUserAccount);
//
//   // supabase/functions/export-user-data/index.ts
//   import { handleExportUserData } from "../_shared/account-data.ts";
//   import { serveEdge } from "../_shared/edge.ts";
//   serveEdge((req) => handleExportUserData(req, { appName: "LoveWell" }));
//
// The client half is nuxt-ionic's `/your-data` page, which calls both
// functions by these names.

import { corsHeaders, errorResponse, jsonResponse, verifyAuth } from "./edge.ts";

// ── Delete ─────────────────────────────────────────────────────────────────
//
// Auth: the caller's JWT. The user id comes from the verified token, never the
// body, so a user can only ever delete their own account.
//
// Confirmation: the body must carry `{ confirmation: <account email> }`,
// compared case-insensitively. It stops a misclick, not an attacker — an
// attacker holding the JWT already knows the email.
//
// Cascade: every user-content table references `auth.users` with
// `on delete cascade` (a convention across these layers), so deleting the auth
// row removes everything. No app-side cascade walk to keep in sync.
export async function handleDeleteUserAccount(req: Request): Promise<Response> {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const { user, supabaseAdmin } = auth;

  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const confirmation = body?.confirmation?.trim().toLowerCase();
  const userEmail = user.email?.toLowerCase();
  if (!confirmation || !userEmail || confirmation !== userEmail) {
    return errorResponse("Confirmation email does not match the account email.", 400);
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("delete-user-account: deleteUser failed", error);
    return errorResponse(`Could not delete account: ${error.message}`, 500);
  }

  return jsonResponse({ ok: true });
}

// ── Export ─────────────────────────────────────────────────────────────────

export type ExportOptions = {
  // Names the app in the bundle's note and the download filename.
  appName: string;
  // Tables the user is on through columns other than `user_id` — a two-sided
  // row like `pairings` (inviter_id / invitee_id). A row matches when ANY of
  // the columns is the caller.
  multiOwnerTables?: Array<{ table: string; columns: string[] }>;
  // Tables to leave out even though they carry `user_id`. Rarely right: the
  // promise is "everything we store about you".
  exclude?: string[];
};

// "LoveWell" → "love-well", "CalmParent" → "calm-parent", "Best Self" → "best-self".
function slugOf(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "account";
}

// Every row the caller owns, as one JSON download.
//
// WHICH tables: `public.user_owned_tables()` reads the catalog for every base
// table with a `user_id` column — so a table any layer or app adds later is
// exported the day it ships. `users` keys on `id` and is always included;
// two-sided tables come from `multiOwnerTables`.
//
// NOT included: platform content (courses, lessons, quotes, principles…) —
// readable by everyone and the same for everyone, so not the caller's data.
//
// A failing table doesn't abort the export: its key holds `{ error }` and the
// rest still downloads. A partial export beats none.
export async function handleExportUserData(req: Request, options: ExportOptions): Promise<Response> {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const { user, supabaseAdmin } = auth;
  const { appName, multiOwnerTables = [], exclude = [] } = options;

  const { data: discovered, error: discoverError } = await supabaseAdmin.rpc("user_owned_tables");
  if (discoverError) {
    console.error("export-user-data: user_owned_tables failed", discoverError.message);
    return errorResponse("Could not list your data. Please try again.", 500);
  }
  const skip = new Set(exclude);
  const tables = ((discovered ?? []) as string[]).filter((t) => !skip.has(t));

  const data: Record<string, unknown> = {};

  // Query builders are thenables, not Promises — hence PromiseLike.
  async function collect(table: string, query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const { data: rows, error } = await query;
    if (error) {
      console.error(`export-user-data: ${table} failed`, error.message);
      data[table] = { error: error.message };
    } else {
      data[table] = rows ?? [];
    }
  }

  await collect("users", supabaseAdmin.from("users").select("*").eq("id", user.id));
  for (const table of tables) {
    await collect(table, supabaseAdmin.from(table).select("*").eq("user_id", user.id));
  }
  for (const { table, columns } of multiOwnerTables) {
    const filter = columns.map((column) => `${column}.eq.${user.id}`).join(",");
    await collect(table, supabaseAdmin.from(table).select("*").or(filter));
  }

  const exportedAt = new Date().toISOString();
  const bundle = {
    user_id: user.id,
    user_email: user.email,
    exported_at: exportedAt,
    notes:
      `This bundle contains every row ${appName} stores where you are the owner. ` +
      "Platform-authored content (courses, lessons, principles, quotes) is not included " +
      "because it is not your data — it is the same for every user.",
    data,
  };

  const filename = `${slugOf(appName)}-export-${user.id.slice(0, 8)}-${exportedAt.slice(0, 10)}.json`;

  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
