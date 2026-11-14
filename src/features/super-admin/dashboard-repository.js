export async function loadSuperAdminDashboardData(supabase) {
  const [businesses, modules, members] = await Promise.all([
    supabase.from("businesses").select("*").order("created_at", { ascending: false }),
    supabase.from("modules").select("*").order("name"),
    supabase.from("business_members").select("id", { count: "exact", head: true }),
  ]);
  if (businesses.error) throw businesses.error;
  if (modules.error) throw modules.error;
  return { businesses: businesses.data || [], modules: modules.data || [], memberCount: members.error ? null : members.count };
}
