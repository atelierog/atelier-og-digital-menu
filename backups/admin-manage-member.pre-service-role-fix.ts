import { withSupabase } from "npm:@supabase/server@^1";

const LOGIN_URL = "https://digitalvision.atelierog.co.in/";
const FROM_EMAIL = "Digital Vision <no-reply@atelierog.co.in>";
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

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

    const { data: business, error: businessError } = await ctx.supabaseAdmin
      .from("businesses").select("id,name").eq("id", businessId).maybeSingle();
    if (businessError || !business) return Response.json({ error: "Business not found" }, { status: 404 });

    const existing = await ctx.supabaseAdmin.auth.admin.getUserByEmail(email);
    if (sendCredentials && existing.data?.user) {
      return Response.json({ error: "An account already exists for this email. Add the existing account without sending a new temporary password." }, { status: 409 });
    }
    if (sendCredentials && !Deno.env.get("RESEND_API_KEY")) {
      return Response.json({ error: "Email delivery is not configured. Add RESEND_API_KEY to Supabase Edge Function secrets, then retry." }, { status: 503 });
    }

    let user = existing.data?.user ?? null;
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

    const { data: member, error: memberError } = await ctx.supabaseAdmin
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
        await ctx.supabaseAdmin.from("business_members").delete().eq("business_id", businessId).eq("user_id", user.id);
        if (createdUser) await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
        return Response.json({ error: "The account email could not be sent. No new login was kept; check the Resend API key and sender-domain configuration, then retry." }, { status: 502 });
      }
    }
    return Response.json({ ok: true, member, invited: !existing.data?.user && !sendCredentials, credentials_sent: sendCredentials });
  })
};
