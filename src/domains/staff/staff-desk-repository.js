export async function loadStaffDeskData(supabase, businessId, limit = 150) {
  const ordersResult = await supabase.from("orders")
    .select("id,order_code,status,total,created_at,customer_name_snapshot,table_id,payment_status")
    .eq("business_id", businessId).order("created_at", { ascending: false }).limit(limit);
  if (ordersResult.error) throw ordersResult.error;
  const orders = ordersResult.data || [];
  const orderIds = orders.map((order) => order.id);
  const [itemsResult, tablesResult] = await Promise.all([
    orderIds.length
      ? supabase.from("order_items").select("order_id,item_name,quantity").eq("business_id", businessId).in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("restaurant_tables").select("id,label,table_number").eq("business_id", businessId),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (tablesResult.error) throw tablesResult.error;
  return { orders, items: itemsResult.data || [], tables: tablesResult.data || [] };
}
