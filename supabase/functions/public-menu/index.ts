import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  try {
    if (req.method === "GET" && action === "menu") {
      const slug = url.searchParams.get("menu") || "";
      const token = url.searchParams.get("table") || "";
      const { data: business } = await db.from("businesses").select("id,name,slug,status,business_type").eq("slug", slug).eq("status", "active").maybeSingle();
      if (!business) return reply({ error: "This restaurant menu is not available." }, 404);
      const [{ data: settings }, { data: table }] = await Promise.all([
        db.from("restaurant_settings").select("menu_published,customer_ordering_enabled,menu_description,logo_url,cover_url,menu_theme,gst_rate").eq("business_id", business.id).maybeSingle(),
        db.from("restaurant_tables").select("id,business_id,table_number,label,active").eq("qr_token", token).maybeSingle()
      ]);
      if (!business || !settings?.menu_published) return reply({ error: "This restaurant menu is not available." }, 404);
      if (!table?.active || table.business_id !== business.id) return reply({ error: "This table QR code is no longer active." }, 404);
      const [categories, items, offers] = await Promise.all([
        db.from("catalog_categories").select("id,name,sort_order").eq("business_id", business.id).eq("active", true).order("sort_order").order("name"),
        db.from("catalog_items").select("id,name,description,price,image_url,category_id").eq("business_id", business.id).eq("active", true).eq("item_type", "product").order("name"),
        db.from("restaurant_offers").select("name,description,discount_kind,discount_value,starts_at,ends_at").eq("business_id", business.id).eq("active", true)
      ]);
      for (const result of [categories, items, offers]) if (result.error) throw result.error;
      const now = Date.now();
      return reply({ business, settings, table: { id: table.id, label: table.label || `Table ${table.table_number}`, number: table.table_number }, categories: categories.data || [], items: items.data || [], offers: (offers.data || []).filter(x => (!x.starts_at || Date.parse(x.starts_at) <= now) && (!x.ends_at || Date.parse(x.ends_at) > now)) });
    }
    if (req.method === "POST" && action === "order") {
      const body = await req.json();
      const slug = String(body.menu || "");
      const token = String(body.table || "");
      const customerName = String(body.customer_name || "Guest").trim().slice(0, 80) || "Guest";
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return reply({ error: "Choose between 1 and 30 menu items." }, 400);
      const [{ data: business }, { data: table }] = await Promise.all([
        db.from("businesses").select("id,name,slug,status").eq("slug", slug).eq("status", "active").maybeSingle(),
        db.from("restaurant_tables").select("id,business_id,active").eq("qr_token", token).maybeSingle()
      ]);
      if (!business || !table?.active || table.business_id !== business.id) return reply({ error: "This restaurant or table QR code is not available." }, 404);
      const { data: settings } = await db.from("restaurant_settings").select("menu_published,customer_ordering_enabled,gst_rate").eq("business_id", business.id).maybeSingle();
      if (!settings?.menu_published || !settings.customer_ordering_enabled) return reply({ error: "Ordering is currently unavailable for this restaurant." }, 403);
      const quantities = new Map<string, number>();
      for (const raw of body.items) {
        const id = String(raw.id || "");
        const qty = Number(raw.quantity);
        if (!id || !Number.isInteger(qty) || qty < 1 || qty > 20) return reply({ error: "One or more item quantities are invalid." }, 400);
        const next = (quantities.get(id) || 0) + qty;
        if (next > 20) return reply({ error: "A maximum of 20 of each item can be ordered." }, 400);
        quantities.set(id, next);
      }
      const { data: catalog, error: catalogError } = await db.from("catalog_items").select("id,name,price").eq("business_id", business.id).eq("active", true).eq("item_type", "product").in("id", [...quantities.keys()]);
      if (catalogError) throw catalogError;
      if ((catalog || []).length !== quantities.size) return reply({ error: "A menu item changed. Refresh the menu and try again." }, 409);
      const items = (catalog || []).map(item => {
        const quantity = quantities.get(item.id)!;
        const unitPrice = Number(item.price || 0);
        return { catalog_item_id: item.id, item_name: item.name, quantity, unit_price: unitPrice, line_total: round(unitPrice * quantity) };
      });
      const subtotal = round(items.reduce((sum, item) => sum + item.line_total, 0));
      const { data: offers, error: offersError } = await db.from("restaurant_offers").select("name,discount_kind,discount_value,starts_at,ends_at").eq("business_id", business.id).eq("active", true);
      if (offersError) throw offersError;
      const now = Date.now();
      const applicable = (offers || []).filter(x => (!x.starts_at || Date.parse(x.starts_at) <= now) && (!x.ends_at || Date.parse(x.ends_at) > now));
      const bestOffer = applicable.map(o => ({ ...o, amount: o.discount_kind === "percentage" ? subtotal * Number(o.discount_value) / 100 : Number(o.discount_value) })).sort((a, b) => b.amount - a.amount)[0];
      const discount = round(Math.min(subtotal, Math.max(0, bestOffer?.amount || 0)));
      const taxable = round(subtotal - discount);
      const tax = round(taxable * Number(settings.gst_rate || 0) / 100);
      const total = round(taxable + tax);
      const orderCode = "DV-" + new Date().toISOString().slice(2, 10).replaceAll("-", "") + "-" + crypto.randomUUID().slice(0, 6).toUpperCase();
      const trackingToken = crypto.randomUUID();
      const { data: created, error } = await db.rpc("create_menu_order", {
        p_business_id: business.id, p_table_id: table.id, p_customer_name: customerName,
        p_order_code: orderCode, p_tracking_token: trackingToken, p_subtotal: subtotal,
        p_discount_total: discount, p_tax_total: tax, p_total: total, p_items: items
      });
      if (error) throw error;
      return reply({ order_id: created?.[0]?.order_id, order_code: orderCode, tracking_token: trackingToken, customer_name: customerName, table: body.table_label || "Your table", items, subtotal, discount, tax, total, offer: bestOffer?.name || null, status: "new" }, 201);
    }
    if (req.method === "GET" && action === "status") {
      const token = url.searchParams.get("token") || "";
      const { data: order, error } = await db.from("orders").select("id,order_code,status,total,subtotal,discount_total,tax_total,customer_name_snapshot,table_id,business_id,created_at").eq("tracking_token", token).maybeSingle();
      if (error) throw error;
      if (!order) return reply({ error: "Order not found." }, 404);
      const [{ data: table }, { data: items }] = await Promise.all([
        db.from("restaurant_tables").select("table_number,label").eq("id", order.table_id).maybeSingle(),
        db.from("order_items").select("item_name,quantity,unit_price,line_total").eq("business_id", order.business_id).eq("order_id", order.id)
      ]);
      return reply({ order_code: order.order_code, status: order.status, total: order.total, subtotal: order.subtotal, discount: order.discount_total, tax: order.tax_total, customer_name: order.customer_name_snapshot, table: table?.label || `Table ${table?.table_number}`, created_at: order.created_at, items: items || [] });
    }
    return reply({ error: "Not found." }, 404);
  } catch (error) {
    console.error("public-menu error", error);
    return reply({ error: "We could not complete that request. Please refresh and try again." }, 500);
  }
});

