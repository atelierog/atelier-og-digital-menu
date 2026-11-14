import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const staffRoles = ["order_taker", "bill_counter"];
const staffEmail = (id: string) => `staff-${id.toLowerCase().replace(/[^a-z0-9]/g, "")}@staff.digitalvision.invalid`;
const validPassword = (value: unknown): value is string => typeof value === "string" && value.length >= 6 && value.length <= 72;
function staffLoginId(name: string, attempt: number) {
  const cleaned = String(name || "Staff").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "STAFF";
  const suffix = attempt ? String(attempt + 1) : "";
  return (cleaned.slice(0, 24 - suffix.length) || "STAFF".slice(0, 24 - suffix.length)) + suffix;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const caller = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!caller) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    const { data: authUser, error: authError } = await ctx.supabaseAdmin.auth.admin.getUserById(caller);
    if (authError || !authUser.user) return Response.json({ error: "Your sign-in could not be verified." }, { status: 401 });
    const body = await req.json().catch(() => null);
    const businessId = String(body?.business_id || "");
    const action = String(body?.action || "");
    if (!businessId || !["create", "reset_password", "convert_existing", "remove_staff", "rename_username"].includes(action)) return Response.json({ error: "Choose a valid staff action and business." }, { status: 400 });
    if (authUser.user.app_metadata?.role === "admin") return Response.json({ error: "Staff accounts are managed by the business Manager." }, { status: 403 });
    const { data: manager } = await db.from("business_members").select("role,status").eq("business_id", businessId).eq("user_id", caller).maybeSingle();
    if (manager?.role !== "manager" || manager.status !== "active") return Response.json({ error: "Active Manager access to this business is required." }, { status: 403 });
    const { data: business } = await db.from("businesses").select("id,status").eq("id", businessId).maybeSingle();
    if (!business || business.status !== "active") return Response.json({ error: "This business is not active." }, { status: 403 });

    if (action === "remove_staff") {
      const userId = String(body?.user_id || "");
      const { data: member, error } = await db.from("business_members").select("user_id,role,status").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
      if (error) return Response.json({ error: "Could not load that staff account." }, { status: 500 });
      if (!member || !staffRoles.includes(member.role)) return Response.json({ error: "Only this business's Order Taker or Bill Counter account can be removed." }, { status: 404 });
      if (member.status === "disabled") return Response.json({ ok: true, status: "disabled" });
      const removed = await db.from("business_members").update({ status: "disabled" }).eq("business_id", businessId).eq("user_id", userId).eq("status", "active").select("user_id").maybeSingle();
      if (removed.error || !removed.data) return Response.json({ error: "Could not remove this staff member." }, { status: 400 });
      const banned = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      return Response.json({ ok: true, status: "disabled", ...(banned.error ? { warning: "Staff access is removed. Sign-in blocking could not be confirmed; try again or contact support." } : {}) });
    }

    if (action === "rename_username") {
      const userId = String(body?.user_id || "");
      const { data: member, error } = await db.from("business_members").select("user_id,role,status,display_name,staff_login_id").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
      if (error) return Response.json({ error: "Could not load that staff account." }, { status: 500 });
      if (!member || !staffRoles.includes(member.role) || member.status !== "active") return Response.json({ error: "Active Order Taker or Bill Counter access is required." }, { status: 404 });
      let loginId = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = staffLoginId(member.display_name || "Staff", attempt);
        const { data: collision, error: lookupError } = await db.from("business_members").select("user_id").eq("staff_login_id", candidate).maybeSingle();
        if (lookupError) return Response.json({ error: "Could not check username availability." }, { status: 500 });
        if (!collision || collision.user_id === userId) { loginId = candidate; break; }
      }
      if (!loginId) return Response.json({ error: "Could not create a unique username from this name. Add a distinctive staff name and try again." }, { status: 409 });
      const currentAuth = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
      if (currentAuth.error || !currentAuth.data.user) return Response.json({ error: "Could not verify this staff account." }, { status: 400 });
      const updatedMember = await db.from("business_members").update({ staff_login_id: loginId }).eq("business_id", businessId).eq("user_id", userId).eq("status", "active");
      if (updatedMember.error) return Response.json({ error: "Could not update the staff username: " + updatedMember.error.message }, { status: 400 });
      const authUpdate = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, {
        email: staffEmail(loginId), email_confirm: true,
        user_metadata: { ...(currentAuth.data.user.user_metadata || {}), display_name: member.display_name || "", staff_login_id: loginId }
      });
      if (authUpdate.error) {
        await db.from("business_members").update({ staff_login_id: member.staff_login_id }).eq("business_id", businessId).eq("user_id", userId);
        return Response.json({ error: "Could not update the staff sign-in username: " + authUpdate.error.message }, { status: 400 });
      }
      return Response.json({ ok: true, staff_login_id: loginId });
    }

    const password = body?.password;
    if (!validPassword(password)) return Response.json({ error: "Use a password with at least 6 characters." }, { status: 400 });
    if (action === "reset_password") {
      const userId = String(body?.user_id || "");
      const { data: member, error } = await db.from("business_members").select("user_id,role,status,staff_login_id").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
      if (error) return Response.json({ error: "Could not load that staff account." }, { status: 500 });
      if (!member || !staffRoles.includes(member.role) || member.status !== "active") return Response.json({ error: "Active Order Taker or Bill Counter access is required." }, { status: 404 });
      const result = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, { password });
      if (result.error) return Response.json({ error: "Could not reset the staff password: " + result.error.message }, { status: 400 });
      return Response.json({ ok: true, staff_login_id: member.staff_login_id });
    }

    if (action === "convert_existing") {
      const userId = String(body?.user_id || "");
      const { data: member, error } = await db.from("business_members").select("user_id,role,status,display_name,staff_login_id").eq("business_id", businessId).eq("user_id", userId).maybeSingle();
      if (error) return Response.json({ error: "Could not load that staff account." }, { status: 500 });
      if (!member || !staffRoles.includes(member.role) || member.status !== "active") return Response.json({ error: "Active Order Taker or Bill Counter access is required." }, { status: 404 });
      if (member.staff_login_id) return Response.json({ error: "This staff account already has a staff ID." }, { status: 409 });
      let loginId = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = staffLoginId(member.display_name || "Staff", attempt);
        const { data: collision, error: lookupError } = await db.from("business_members").select("user_id").eq("staff_login_id", candidate).maybeSingle();
        if (lookupError) return Response.json({ error: "Could not check staff ID availability." }, { status: 500 });
        if (!collision) { loginId = candidate; break; }
      }
      if (!loginId) return Response.json({ error: "Could not generate a unique staff ID. Try again." }, { status: 503 });
      const updatedMember = await db.from("business_members").update({ staff_login_id: loginId }).eq("business_id", businessId).eq("user_id", userId).is("staff_login_id", null);
      if (updatedMember.error) return Response.json({ error: "Could not assign the staff ID: " + updatedMember.error.message }, { status: 400 });
      const currentUser = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
      if (currentUser.error || !currentUser.data.user) {
        await db.from("business_members").update({ staff_login_id: null }).eq("business_id", businessId).eq("user_id", userId);
        return Response.json({ error: "Could not verify the existing staff login." }, { status: 400 });
      }
      const authUpdate = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, {
        email: staffEmail(loginId), email_confirm: true, password,
        app_metadata: { ...(currentUser.data.user.app_metadata || {}), staff_login: true },
        user_metadata: { ...(currentUser.data.user.user_metadata || {}), display_name: member.display_name || "", staff_login_id: loginId }
      });
      if (authUpdate.error) {
        await db.from("business_members").update({ staff_login_id: null }).eq("business_id", businessId).eq("user_id", userId);
        return Response.json({ error: "Could not convert this account to a staff ID: " + authUpdate.error.message }, { status: 400 });
      }
      return Response.json({ ok: true, staff_login_id: loginId });
    }

    const displayName = String(body?.display_name || "").trim().slice(0, 120);
    const role = String(body?.role || "");
    if (!displayName) return Response.json({ error: "Enter the staff member's name." }, { status: 400 });
    if (!staffRoles.includes(role)) return Response.json({ error: "Managers can create only Order Taker or Bill Counter accounts." }, { status: 400 });

    let loginId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = staffLoginId(displayName, attempt);
      const { data: collision, error } = await db.from("business_members").select("user_id").eq("staff_login_id", candidate).maybeSingle();
      if (error) return Response.json({ error: "Could not check staff ID availability." }, { status: 500 });
      if (!collision) { loginId = candidate; break; }
    }
    if (!loginId) return Response.json({ error: "Could not generate a unique staff ID. Try again." }, { status: 503 });

    const created = await ctx.supabaseAdmin.auth.admin.createUser({
      email: staffEmail(loginId), email_confirm: true, password,
      app_metadata: { staff_login: true },
      user_metadata: { display_name: displayName, staff_login_id: loginId }
    });
    if (created.error || !created.data.user) return Response.json({ error: "Could not create the staff sign-in: " + (created.error?.message || "Unknown Auth error") }, { status: 400 });
    const { data: member, error: memberError } = await db.from("business_members").insert({
      business_id: businessId, user_id: created.data.user.id, role, display_name: displayName, status: "active", staff_login_id: loginId
    }).select("user_id,role,display_name,status,staff_login_id").single();
    if (memberError) {
      await ctx.supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
      return Response.json({ error: "Could not save the staff role: " + memberError.message }, { status: 400 });
    }
    return Response.json({ ok: true, member, staff_login_id: loginId }, { status: 201 });
  })
};

