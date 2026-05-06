// invite-send (layer Edge Function)
//
// Generic invite handler shared by all apps consuming nuxt-supabase.
// Validates auth, manages the invites/members/friends tables, and
// optionally sends a branded email via Resend if the calling app passes
// app_name / app_url / from_email parameters.
//
// Request body:
//   {
//     groupId?:    string,         // present for group invites
//     email:       string,         // required
//     groupName?:  string,         // for the email subject / body
//     fromName?:   string,         // who's inviting
//     app_name?:   string,         // for email branding (e.g. "BestSelf")
//     app_url?:    string,         // for the CTA link in the email
//     from_email?: string,         // sending address
//     send_email?: boolean,        // default true; set false to skip email send
//   }
//
// Response:
//   { added: true }   when the invitee already had an account and was added directly
//   { invited: true } when an email invite was sent or queued
//
// Email send is best-effort: if RESEND_API_KEY isn't configured or the call
// fails, the invite row is still stored and the trigger will pick the user
// up when they sign up.

import { errorResponse, jsonResponse, serveEdge, verifyAuth } from "../_shared/edge.ts";

serveEdge(async (req) => {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const { user, supabaseAdmin } = auth;

  const body = await req.json();
  const {
    groupId,
    email,
    groupName,
    fromName,
    app_name = "the app",
    app_url = "",
    from_email,
    send_email = true,
  } = body;

  if (!email) return errorResponse("Missing email", 400);

  const normalizedEmail = (email as string).trim().toLowerCase();
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = from_email
    ? `${app_name} <${from_email}>`
    : `${app_name} <hello@${app_name.toLowerCase().replace(/\s+/g, "")}.app>`;

  // ── Friend invite (no groupId) ──────────────────────────────────────────
  if (!groupId) {
    if (send_email && resendKey) {
      await sendEmail({
        resendKey,
        from: fromAddress,
        to: normalizedEmail,
        subject: `${fromName ?? "Someone"} wants to be friends on ${app_name}`,
        html: friendInviteHtml({ fromName, appName: app_name, appUrl: app_url, email: normalizedEmail }),
      });
    }
    return jsonResponse({ invited: true });
  }

  // ── Group invite ────────────────────────────────────────────────────────
  // Verify caller owns the group
  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id, owner_id")
    .eq("id", groupId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!group) return errorResponse("Forbidden", 403);

  // If user already exists, add them directly as a member
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (existingUser) {
    await supabaseAdmin
      .from("members")
      .insert({ group_id: groupId, user_id: existingUser.id, role: "member" });
    return jsonResponse({ added: true });
  }

  // Otherwise store the pending invite (upsert)
  await supabaseAdmin
    .from("invites")
    .upsert(
      { group_id: groupId, email: normalizedEmail, invited_by: user.id },
      { onConflict: "group_id,email" }
    );

  if (send_email && resendKey) {
    await sendEmail({
      resendKey,
      from: fromAddress,
      to: normalizedEmail,
      subject: `${fromName ?? "Someone"} invited you to join ${groupName ?? "a group"} on ${app_name}`,
      html: groupInviteHtml({ fromName, groupName, appName: app_name, appUrl: app_url, email: normalizedEmail }),
    });
  }

  return jsonResponse({ invited: true });
});

// ── Email helpers ──────────────────────────────────────────────────────────

async function sendEmail(opts: { resendKey: string; from: string; to: string; subject: string; html: string }) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${opts.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
  } catch (e) {
    // Best-effort send; the invite row is already stored, the trigger handles
    // the rest when the user signs up. Don't fail the function on email errors.
    console.error("invite-send: email failed", e);
  }
}

function friendInviteHtml({ fromName, appName, appUrl, email }: { fromName?: string; appName: string; appUrl: string; email: string }) {
  const link = appUrl ? `${appUrl}/login` : "#";
  return `
    <p>Hi there,</p>
    <p><strong>${fromName ?? "A friend"}</strong> wants to connect with you on <strong>${appName}</strong>.</p>
    <p>Sign up to accept their friend request:</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Join ${appName}</a></p>
    <p style="color:#888;font-size:0.85rem;">Use this email address (${email}) when signing up and you'll be connected automatically.</p>
  `;
}

function groupInviteHtml({ fromName, groupName, appName, appUrl, email }: { fromName?: string; groupName?: string; appName: string; appUrl: string; email: string }) {
  const link = appUrl ? `${appUrl}/login` : "#";
  const group = groupName ?? "their group";
  return `
    <p>Hi there,</p>
    <p><strong>${fromName ?? "A friend"}</strong> has invited you to join <strong>${group}</strong> on <strong>${appName}</strong>.</p>
    <p>Sign up to accept your invitation:</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Join ${group}</a></p>
    <p style="color:#888;font-size:0.85rem;">Use this email address (${email}) when signing up and you'll be added to the group automatically.</p>
  `;
}
