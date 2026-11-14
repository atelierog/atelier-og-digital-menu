import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const emailFrom = "Digital Vision <no-reply@atelierog.co.in>";
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const validId = (value: unknown): value is string => typeof value === "string" && /^(?:(OT|BC)-[A-Z0-9]{8}|[A-Z][A-Z0-9]{1,23})$/.test(value.trim().toUpperCase());
const validPassword = (value: unknown): value is string => typeof value === "string" && value.length >= 6 && value.length <= 72;
async function hashCode(userId: string, code: string) {
  const secret = Deno.env.get("STAFF_RESET_HMAC_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId + ":" + code));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json().catch(() => null), action = String(body?.action || ""), staffId = String(body?.staff_login_id || "").trim().toUpperCase();
    if (!validId(staffId)) return reply({ error: "Enter a valid staff ID." }, 400);
    const { data: member } = await db.from("business_members").select("business_id,user_id,role,status,display_name,staff_login_id").eq("staff_login_id", staffId).maybeSingle();
    if (!member || member.status !== "active" || !["order_taker", "bill_counter"].includes(member.role)) {
      return action === "request" ? reply({ ok: true }) : reply({ error: "The staff ID or reset code is incorrect or expired." }, 400);
    }
    if (action === "request") {
      const apiKey = Deno.env.get("RESEND_API_KEY");
      const { data: manager } = await db.from("business_members").select("user_id").eq("business_id", member.business_id).eq("role", "manager").eq("status", "active").limit(1).maybeSingle();
      if (!manager || !apiKey) return reply({ error: "The Manager reset email is unavailable. Ask the Manager to reset your password directly." }, 503);
      const { data: managerAuth } = await db.auth.admin.getUserById(manager.user_id);
      const managerEmail = managerAuth.user?.email;
      if (!managerEmail) return reply({ error: "The Manager reset email is unavailable. Ask the Manager to reset your password directly." }, 503);
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count } = await db.from("staff_password_reset_requests").select("id", { count: "exact", head: true }).eq("staff_user_id", member.user_id).gte("created_at", oneMinuteAgo);
      if ((count || 0) > 0) return reply({ ok: true });
      const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); const code = String(bytes[0] % 1_000_000).padStart(6, "0");
      const { data: request, error: insertError } = await db.from("staff_password_reset_requests").insert({ business_id: member.business_id, staff_user_id: member.user_id, manager_user_id: manager.user_id, code_hash: await hashCode(member.user_id, code), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).select("id").single();
      if (insertError || !request) return reply({ error: "Could not prepare a reset code. Ask the Manager to reset the password directly." }, 503);
      const name = esc(member.display_name || member.role.replace("_", " "));
      const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ from: emailFrom, to: [managerEmail], subject: "Staff password reset request — Digital Vision", text: `A password reset was requested for ${member.role.replace("_", " ")} ${member.display_name || "staff member"} (${staffId}). One-time code: ${code}. It expires in 10 minutes. Share it only with this staff member.`, html: `<p>A password reset was requested for <strong>${name}</strong> (${esc(staffId)}).</p><p>One-time code: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>This code expires in 10 minutes. Share it only with this staff member.</p>` }) });
      if (!sent.ok) { await db.from("staff_password_reset_requests").delete().eq("id", request.id); return reply({ error: "Could not send the code to the Manager. Ask the Manager to reset the password directly." }, 502); }
      return reply({ ok: true });
    }
    if (action !== "complete") return reply({ error: "Choose request or complete." }, 400);
    if (!validPassword(body?.password)) return reply({ error: "Use a password with at least 6 characters." }, 400);
    const { data: reset } = await db.from("staff_password_reset_requests").select("id,code_hash,expires_at,attempts").eq("business_id", member.business_id).eq("staff_user_id", member.user_id).is("consumed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!reset || reset.attempts >= 5 || Date.parse(reset.expires_at) <= Date.now() || await hashCode(member.user_id, String(body?.code || "")) !== reset.code_hash) {
      if (reset && reset.attempts < 5) await db.from("staff_password_reset_requests").update({ attempts: reset.attempts + 1, ...(reset.attempts >= 4 ? { consumed_at: new Date().toISOString() } : {}) }).eq("id", reset.id);
      return reply({ error: "The staff ID or reset code is incorrect or expired." }, 400);
    }
    const changed = await db.auth.admin.updateUserById(member.user_id, { password: body.password });
    if (changed.error) return reply({ error: "Could not update the password. Ask the Manager to reset it directly." }, 400);
    await db.from("staff_password_reset_requests").update({ consumed_at: new Date().toISOString() }).eq("id", reset.id);
    return reply({ ok: true });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Could not complete the reset request." }, 500);
  }
});

