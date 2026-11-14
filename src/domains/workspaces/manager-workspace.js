export async function loadManagerWorkspace(supabase, businessId, userId, knownModules = [], knownMembership = null) {
  const [businessResult, membershipResult, entitlementsResult, modulesResult] = await Promise.all([
    supabase.from("businesses").select("id,name,business_type,slug,status").eq("id", businessId).single(),
    knownMembership ? Promise.resolve({ data: knownMembership, error: null }) : supabase.from("business_members").select("role,display_name,status").eq("business_id", businessId).eq("user_id", userId).maybeSingle(),
    supabase.from("business_modules").select("module_id,enabled").eq("business_id", businessId).eq("enabled", true),
    knownModules.length
      ? Promise.resolve({ data: knownModules, error: null })
      : supabase.from("modules").select("*").order("name"),
  ]);
  for (const result of [businessResult, membershipResult, entitlementsResult, modulesResult]) {
    if (result.error) throw result.error;
  }
  return {
    business: businessResult.data,
    membership: membershipResult.data,
    enabledRows: entitlementsResult.data || [],
    modules: modulesResult.data || [],
  };
}
