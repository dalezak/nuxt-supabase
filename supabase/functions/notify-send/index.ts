// notify-send (layer Edge Function)
//
// Generic web-push dispatcher. Apps build their own scheduled jobs / cron
// triggers that select WHO to notify (by querying the data their way) and
// invoke this function with a list of user_ids + payload.
//
// Auth: Bearer SUPABASE_SERVICE_ROLE_KEY (only callable from other Edge
// Functions or pg_cron — never from clients).
//
// Request body:
//   {
//     user_ids: string[],   // recipients
//     title:    string,     // notification title
//     body:     string,     // notification body
//     url?:     string,     // optional click-through path (default '/')
//   }
//
// Response:
//   { sent: number, expired: number }
//
// Expired subscriptions (HTTP 410 from the push service) are auto-deleted
// so the table stays clean.

import webPush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js";

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { user_ids, title, body, url } = await req.json();
  if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !body) {
    return new Response("Missing or invalid payload (need user_ids[], title, body)", { status: 400 });
  }

  webPush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const { data: subs } = await supabase
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
        // Push service says this endpoint is permanently gone — clean up.
        expired.push(sub.id);
      }
    }
  }

  if (expired.length) {
    await supabase.from("subscriptions").delete().in("id", expired);
  }

  return new Response(JSON.stringify({ sent, expired: expired.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
