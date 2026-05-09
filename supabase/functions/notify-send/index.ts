// notify-send (layer Edge Function)
//
// Generic web-push dispatcher. Apps build their own scheduled jobs / cron
// triggers that select WHO to notify (by querying the data their way) and
// invoke this function with a list of user_ids + payload.
//
// Auth: Bearer SUPABASE_SERVICE_ROLE_KEY (only callable from other Edge
// Functions or pg_cron — never from clients). This bypasses the standard
// `verifyAuth` flow because notify-send is server-to-server only.
//
// Request body:
//   {
//     user_ids: string[],   // recipients
//     title:    string,     // notification title
//     body:     string,     // notification body
//     url?:     string,     // optional click-through path (default '/')
//   }
//
// Response: { sent: number, expired: number }
//
// Expired subscriptions (HTTP 410 from the push service) are auto-deleted
// so the table stays clean.

import webPush from "npm:web-push";
import { errorResponse, jsonResponse, serveEdge, verifyServiceRole } from "../_shared/edge.ts";

serveEdge(async (req) => {
  // Service-role-only: invoked server-to-server (cron jobs, app Edge Functions),
  // never from a user client.
  const auth = verifyServiceRole(req);
  if (!auth.ok) return auth.response;
  const { supabaseAdmin } = auth;

  const { user_ids, title, body, url } = await req.json();
  if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !body) {
    return errorResponse("Missing or invalid payload (need user_ids[], title, body)", 400);
  }

  webPush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .in("user_id", user_ids);

  const payload = JSON.stringify({ title, body, url: url ?? "/" });

  let sent = 0;
  const expired: string[] = [];

  for (const sub of subs ?? []) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410) {
        expired.push(sub.id);
      }
    }
  }

  if (expired.length) {
    await supabaseAdmin.from("subscriptions").delete().in("id", expired);
  }

  return jsonResponse({ sent, expired: expired.length });
});
