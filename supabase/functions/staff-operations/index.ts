import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const caller = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!caller) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    const { data: user } = await ctx.supabaseAdmin.auth.admin.getUserById(caller);
    if (!user.user) return Response.json({ error: "Your sign-in could not be verified." }, { status: 401 });
    const body = await req.json().catch(() => null);
    const businessId = String(body?.business_id || ""), orderId = String(body?.order_id || ""), action = String(body?.action || "");
    if (!businessId || !orderId || !["update_status", "mark_paid"].includes(action)) return Response.json({ error: "Invalid order action." }, { status: 400 });
    const { data: member } = await db.from("business_members").select("role,status").eq("business_id", businessId).eq("user_id", caller).maybeSingle();
    const isAdmin = user.user.app_metadata?.role === "admin";
    if (!isAdmin && (!member || member.status !== "active")) return Response.json({ error: "Active access to this business is required." }, { status: 403 });
    const role = isAdmin ? "admin" : member!.role;
    const [{ data: business }, { data: orderingModule }, { data: enabledModules }] = await Promise.all([
      db.from("businesses").select("status").eq("id", businessId).maybeSingle(),
      db.from("modules").select("id").eq("code", "ordering").maybeSingle(),
      db.from("business_modules").select("module_id").eq("business_id", businessId).eq("enabled", true)
    ]);
    if (!business || business.status !== "active") return Response.json({ error: "This business is not active." }, { status: 403 });
    if (!orderingModule || !enabledModules?.some(row => row.module_id === orderingModule.id)) return Response.json({ error: "Ordering is not enabled for this business." }, { status: 403 });
    const { data: order, error: orderError } = await db.from("orders").select("id,status,payment_status").eq("business_id", businessId).eq("id", orderId).maybeSingle();
    if (orderError) return Response.json({ error: "Could not load the order." }, { status: 500 });
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (action === "update_status") {
      const next = String(body?.status || "");
      if (!(["manager", "order_taker", "admin"].includes(role))) return Response.json({ error: "Order Taker access is required to update order status." }, { status: 403 });
      const transitions: Record<string, string[]> = { new: ["accepted", "cancelled"], accepted: ["delivered"], processing: ["delivered"] };
      if (!(transitions[order.status] || []).includes(next)) return Response.json({ error: "That status change is not available for this order." }, { status: 409 });
      const updated = await db.from("orders").update({ status: next }).eq("business_id", businessId).eq("id", orderId);
      if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
      return Response.json({ ok: true, status: next });
    }
    if (!["manager", "bill_counter", "admin"].includes(role)) return Response.json({ error: "Bill Counter access is required to record payment." }, { status: 403 });
    if (!( ["accepted", "processing", "delivered"].includes(order.status) )) return Response.json({ error: "Accept the order before taking payment." }, { status: 409 });
    if (order.payment_status === "paid") return Response.json({ ok: true, payment_status: "paid" });
    const updated = await db.from("orders").update({ payment_status: "paid" }).eq("business_id", businessId).eq("id", orderId).eq("payment_status", "open");
    if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
    return Response.json({ ok: true, payment_status: "paid" });
  })
};

