import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOGIN_URL = "https://digitalvision.atelierog.co.in/?login=manager";
const FROM_EMAIL = "Digital Vision <no-reply@atelierog.co.in>";
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
const serviceDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

function temporaryPassword(length = 20) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => PASSWORD_CHARS[byte % PASSWORD_CHARS.length]).join("");
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const caller = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { data: callerData, error: callerError } = await ctx.supabaseAdmin.auth.admin.getUserById(caller);
    if (callerError || callerData.user?.app_metadata?.role !== "admin") {
      return Response.json({ error: "Super Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const businessId = body?.business_id;
    const email = String(body?.email || "").trim().toLowerCase();
    const role = body?.role;
    const displayName = String(body?.display_name || "").trim() || null;
    const sendCredentials = body?.send_temporary_credentials === true;
    if (!businessId || !email || !["owner", "manager", "staff"].includes(role)) {
      return Response.json({ error: "business_id, email and valid role are required" }, { status: 400 });
    }

    const { data: business, error: businessError } = await serviceDb
      .from("businesses").select("id,name").eq("id", businessId).maybeSingle();
    if (businessError) return Response.json({ error: "Business lookup failed: " + businessError.message }, { status: 500 });
    if (!business) return Response.json({ error: "Business not found for the supplied business_id" }, { status: 404 });

    // Supabase Auth Admin API has listUsers(), not getUserByEmail().
    // Search paginated users and fail explicitly if Auth lookup fails.
    let existingUser: any = null;
    let userLookupComplete = false;
    for (let page = 1; page <= 100; page++) {
      const listed = await serviceDb.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) {
        return Response.json({ error: "Could not check whether the manager email already has an account: " + listed.error.message, code: "AUTH_USER_LOOKUP_FAILED" }, { status: 502 });
      }
      const users = listed.data.users || [];
      existingUser = users.find((candidate: any) => (candidate.email || "").toLowerCase() === email) || null;
      if (existingUser) { userLookupComplete = true; break; }
      if (users.length < 1000) { userLookupComplete = true; break; }
    }
    if (!userLookupComplete) {
      return Response.json({ error: "Could not safely finish the manager account lookup. Retry or contact the platform administrator.", code: "AUTH_USER_LOOKUP_INCOMPLETE" }, { status: 503 });
    }
    if (sendCredentials && existingUser) {
      return Response.json({ error: "An account already exists for this email. Add the existing account without sending a new temporary password." }, { status: 409 });
    }
    if (sendCredentials && !Deno.env.get("RESEND_API_KEY")) {
      return Response.json({ error: "Email delivery is not configured. Add RESEND_API_KEY to Supabase Edge Function secrets, then retry." }, { status: 503 });
    }

    let user = existingUser ?? null;
    let createdUser = false;
    let tempPassword: string | null = null;
    if (!user && sendCredentials) {
      tempPassword = temporaryPassword();
      const created = await ctx.supabaseAdmin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        app_metadata: { must_change_password: true },
        user_metadata: displayName ? { display_name: displayName } : {}
      });
      if (created.error || !created.data.user) return Response.json({ error: created.error?.message || "Could not create the manager account" }, { status: 400 });
      user = created.data.user;
      createdUser = true;
    } else if (!user) {
      const invited = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email);
      if (invited.error || !invited.data.user) return Response.json({ error: invited.error?.message || "Could not invite user" }, { status: 400 });
      user = invited.data.user;
    }

    const { data: member, error: memberError } = await serviceDb
      .from("business_members")
      .upsert({ business_id: businessId, user_id: user.id, role, display_name: displayName, status: "active" }, { onConflict: "business_id,user_id" })
      .select().single();
    if (memberError) {
      if (createdUser) await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
      return Response.json({ error: memberError.message }, { status: 400 });
    }

    if (sendCredentials && tempPassword) {
      const safeEmail = escapeHtml(email);
      const safePassword = escapeHtml(tempPassword);
      const safeBusinessName = escapeHtml(String(business.name || "your business"));
      const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>@media(max-width:600px){.card{width:100%!important}.pad{padding:22px 18px!important}.credential{overflow-wrap:anywhere!important;word-break:break-word!important}}</style></head><body style="margin:0;padding:0;background:#f2f5f3;font-family:Arial,Helvetica,sans-serif;color:#17211f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f3;padding:24px 10px"><tr><td align="center"><table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dbe5e0;border-radius:18px;overflow:hidden"><tr><td style="background:#081714;padding:26px 28px;color:#ffffff"><div style="font-size:11px;letter-spacing:3px;color:#a7d9ca">ATELIER OG</div><div style="font-size:27px;font-weight:700;line-height:1.25;margin-top:8px">Digital Vision</div><div style="font-size:14px;color:#d4e4de;margin-top:6px">Business workspace access</div></td></tr><tr><td class="pad" style="padding:30px 28px"><h1 style="font-size:23px;line-height:1.3;margin:0 0 12px;color:#14221e">Your account is ready</h1><p style="font-size:15px;line-height:1.65;margin:0 0 22px;color:#4c5c56">You have been invited to manage <strong>' + safeBusinessName + '</strong> in Digital Vision.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border:1px solid #dce7e1;border-radius:12px;background:#f7faf8"><tr><td style="padding:16px 17px;border-bottom:1px solid #dce7e1"><div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5b6d65;margin-bottom:8px">Login ID</div><div class="credential" style="font-size:15px;line-height:1.5;color:#16231f;overflow-wrap:anywhere;word-break:break-word">' + safeEmail + '</div></td></tr><tr><td style="padding:16px 17px"><div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5b6d65;margin-bottom:8px">Temporary password</div><div class="credential" style="font-family:Consolas,Monaco,monospace;font-size:16px;line-height:1.6;color:#16231f;overflow-wrap:anywhere;word-break:break-all">' + safePassword + '</div><div style="font-size:12px;line-height:1.5;color:#62736b;margin-top:8px">Keep these details private. You will be asked to choose a new password at first sign-in.</div></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 18px"><tr><td align="center" bgcolor="#0c3329" style="border-radius:10px"><a href="' + LOGIN_URL + '" target="_blank" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">Open manager sign-in</a></td></tr></table><p style="font-size:13px;line-height:1.6;color:#5a6a63;margin:0">For security, this link opens a separate manager sign-in session and does not reuse another account already signed in on this browser.</p></td></tr><tr><td style="padding:18px 28px;background:#f7faf8;border-top:1px solid #e4ebe7;font-size:12px;line-height:1.6;color:#6a7a73">This is an automated account email from Digital Vision by Atelier OG. If you were not expecting this invitation, contact your platform administrator.</td></tr></table></td></tr></table></body></html>';
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + Deno.env.get("RESEND_API_KEY"), "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL, to: [email], subject: "Your Digital Vision login details",
          text: "Your Digital Vision account is ready.\\nBusiness: " + business.name + "\\nLogin ID: " + email + "\\nTemporary password: " + tempPassword + "\\nManager sign-in: " + LOGIN_URL + "\\n\\nYou must change this temporary password at first sign-in. Keep these details private.",
          html
        })
      });
      if (!response.ok) {
        await serviceDb.from("business_members").delete().eq("business_id", businessId).eq("user_id", user.id);
        if (createdUser) await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
        return Response.json({ error: "The account email could not be sent. No new login was kept; check the Resend API key and sender-domain configuration, then retry." }, { status: 502 });
      }
    }
    return Response.json({ ok: true, member, invited: !existingUser && !sendCredentials, credentials_sent: sendCredentials });
  })
};
