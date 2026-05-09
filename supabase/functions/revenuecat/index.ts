// revenuecat (layer Edge Function)
//
// RevenueCat webhook handler. Maps purchase events to the user's
// `subscription_status` / `_expires_at` / `_platform` columns.
//
// Generic across all apps consuming this layer — the only per-app concern
// is the product-id → tier mapping, supplied via env var:
//
//   REVENUECAT_PRODUCT_MAP={"app_standard_monthly":"standard","app_premium_monthly":"premium"}
//
// Webhook is verified via shared secret (set in RevenueCat dashboard +
// REVENUECAT_WEBHOOK_SECRET env var). RevenueCat passes Authorization on
// webhook delivery; we do an exact match.
//
// RevenueCat sends Supabase user_id as `app_user_id` — set this when
// initialising RevenueCat on the client (`Purchases.logIn(userId)`).

import { errorResponse, jsonResponse, serveEdge } from "../_shared/edge.ts";
import { createClient } from "npm:@supabase/supabase-js";

function loadProductMap(): Record<string, string> {
  const raw = Deno.env.get("REVENUECAT_PRODUCT_MAP");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("revenuecat: REVENUECAT_PRODUCT_MAP is not valid JSON", e);
    return {};
  }
}

function statusFromEvent(event: any, productMap: Record<string, string>): { status: string; expiresAt: string | null } {
  const type = event.type;
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  if (["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"].includes(type)) {
    const productId = event.product_id ?? "";
    // Fall back to 'standard' if product unmapped — apps should keep
    // REVENUECAT_PRODUCT_MAP up to date or accept this default.
    const status = productMap[productId] ?? "standard";
    return { status, expiresAt };
  }

  if (["CANCELLATION", "EXPIRATION", "BILLING_ISSUE"].includes(type)) {
    return { status: "free", expiresAt: null };
  }

  // Unknown / no-op events (TEST, TRANSFER, etc.) — leave state unchanged.
  return { status: "", expiresAt: null };
}

function platformFromStore(store: string): string {
  if (store === "APP_STORE") return "ios";
  if (store === "PLAY_STORE") return "android";
  if (store === "STRIPE") return "web";
  return (store ?? "").toLowerCase();
}

serveEdge(async (req) => {
  // Verify the RevenueCat shared secret (set in RC dashboard → Webhooks).
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (secret) {
    const authorization = req.headers.get("Authorization");
    if (authorization !== secret) return errorResponse("Unauthorized", 401);
  }

  const body = await req.json();
  const event = body.event;
  if (!event) return errorResponse("Missing event", 400);

  const userId = event.app_user_id;
  if (!userId) return errorResponse("Missing app_user_id", 400);

  const productMap = loadProductMap();
  const { status, expiresAt } = statusFromEvent(event, productMap);
  if (!status) {
    // No-op event — acknowledge so RevenueCat doesn't retry.
    return jsonResponse({ ok: true, skipped: event.type });
  }

  const platform = platformFromStore(event.store ?? "");
  console.log(`revenuecat: user=${userId} type=${event.type} status=${status} platform=${platform}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase
    .from("users")
    .update({
      subscription_status: status,
      subscription_expires_at: expiresAt,
      subscription_platform: platform,
    })
    .eq("id", userId);

  if (error) {
    console.error("revenuecat: failed to update subscription", error);
    return errorResponse(error.message, 500);
  }

  return jsonResponse({ ok: true });
});
