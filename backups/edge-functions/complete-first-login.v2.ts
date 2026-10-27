import { withSupabase } from "npm:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const userId = ctx.userClaims?.sub;
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { data, error } = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) return Response.json({ error: "Account not found" }, { status: 404 });
    if (data.user.app_metadata?.must_change_password !== true) {
      return Response.json({ ok: true, already_complete: true });
    }
    const { error: updateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { ...data.user.app_metadata, must_change_password: false }
    });
    if (updateError) return Response.json({ error: "Could not complete first-login setup" }, { status: 500 });
    return Response.json({ ok: true });
  })
};
