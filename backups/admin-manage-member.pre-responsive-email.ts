import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOGIN_URL = "https://digitalvision.atelierog.co.in/";
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
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + Deno.env.get("RESEND_API_KEY"), "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL, to: [email], subject: "Your Digital Vision login details",
          text: "Your Digital Vision account is ready.\nLogin ID: " + email + "\nTemporary password: " + tempPassword + "\nLogin page: " + LOGIN_URL + "\n\nYou must change this temporary password at your first sign-in.",
          html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17181b"><h2>Digital Vision</h2><p>Your account is ready.</p><p><strong>Login ID</strong><br>' + safeEmail + '</p><p><strong>Temporary password</strong><br><code style="font-size:16px">' + safePassword + '</code></p><p><a href="' + LOGIN_URL + '">Open Digital Vision</a></p><p>You must change this temporary password at your first sign-in.</p></div>'
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
