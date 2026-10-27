import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const serviceDb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const operationalTables = [
  "orders", "order_items", "customers", "catalog_items",
  "catalog_categories", "audit_logs", "inquiries"
];

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const caller = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (!caller) return Response.json({ error: "Your session could not be verified. Sign in again.", code: "UNAUTHENTICATED" }, { status: 401 });
    const { data: callerData, error: callerError } = await ctx.supabaseAdmin.auth.admin.getUserById(caller);
    if (callerError || callerData.user?.app_metadata?.role !== "admin") {
      return Response.json({ error: "Super Admin access is required for business lifecycle actions.", code: "SUPER_ADMIN_REQUIRED" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const businessId = String(body?.business_id ?? "");
    const action = String(body?.action ?? "");
    if (!businessId || !["suspend", "activate", "archive", "delete"].includes(action)) {
      return Response.json({ error: "Provide a business_id and one action: suspend, activate, archive, delete.", code: "INVALID_REQUEST" }, { status: 400 });
    }

    const { data: business, error: lookupError } = await serviceDb.from("businesses").select("id,name,status").eq("id", businessId).maybeSingle();
    if (lookupError) return Response.json({ error: "Business lookup failed: " + lookupError.message, code: "BUSINESS_LOOKUP_FAILED" }, { status: 500 });
    if (!business) return Response.json({ error: "No business exists for the supplied business ID.", code: "BUSINESS_NOT_FOUND" }, { status: 404 });

    if (action === "delete") {
      const counts: Record<string, number> = {};
      for (const table of operationalTables) {
        const { count, error } = await serviceDb.from(table).select("id", { count: "exact", head: true }).eq("business_id", businessId);
        if (error) return Response.json({ error: "Cannot verify whether business data exists in " + table + ": " + error.message, code: "DELETE_SAFETY_CHECK_FAILED", table }, { status: 500 });
        counts[table] = count ?? 0;
      }
      const occupied = Object.entries(counts).filter(([, count]) => count > 0).map(([table, count]) => ({ table, count }));
      if (occupied.length) {
        return Response.json({
          error: "This business has operational data and cannot be permanently deleted. Archive it instead to preserve records.",
          code: "BUSINESS_HAS_DATA",
          records: occupied
        }, { status: 409 });
      }
      const { error: membersError } = await serviceDb.from("business_members").delete().eq("business_id", businessId);
      if (membersError) return Response.json({ error: "Could not remove business memberships: " + membersError.message, code: "MEMBERSHIP_DELETE_FAILED" }, { status: 500 });
      const { error: modulesError } = await serviceDb.from("business_modules").delete().eq("business_id", businessId);
      if (modulesError) return Response.json({ error: "Could not remove module assignments: " + modulesError.message, code: "MODULE_ASSIGNMENT_DELETE_FAILED" }, { status: 500 });
      const { error: deleteError } = await serviceDb.from("businesses").delete().eq("id", businessId);
      if (deleteError) return Response.json({ error: "Could not delete business: " + deleteError.message, code: "BUSINESS_DELETE_FAILED" }, { status: 500 });
      return Response.json({ ok: true, action, business_id: businessId, business_name: business.name });
    }

    const status = action === "suspend" ? "suspended" : action === "activate" ? "active" : "archived";
    const { data: updated, error: updateError } = await serviceDb.from("businesses").update({ status }).eq("id", businessId).select("id,name,status").single();
    if (updateError) return Response.json({ error: "Could not change business status: " + updateError.message, code: "BUSINESS_STATUS_UPDATE_FAILED" }, { status: 500 });
    return Response.json({ ok: true, action, business: updated });
  })
};
