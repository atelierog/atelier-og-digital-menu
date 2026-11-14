import { test, expect } from "@playwright/test";

const businessId = "business-1";
const userId = "manager-user-1";
const modules = [
  { id: "module-catalog", code: "catalog", name: "Menu & products" },
  { id: "module-ordering", code: "ordering", name: "Orders & bills" },
  { id: "module-qr", code: "qr", name: "Tables & QR" },
  { id: "module-digital-page", code: "digital_page", name: "Digital menu" },
  { id: "module-analytics", code: "analytics", name: "Reports" },
];
const enabledRows = modules.map((module) => ({ module_id: module.id, enabled: true }));
const business = { id: businessId, name: "Browser Test Cafe", business_type: "restaurant", slug: "browser-test-cafe", status: "active" };
const membership = { business_id: businessId, user_id: userId, role: "manager", display_name: "Test Manager", status: "active" };

async function installSupabaseMocks(page, role = "manager") {
  const user = {
    id: role === "admin" ? "admin-user-1" : userId,
    email: role === "admin" ? "admin@example.test" : "manager@example.test",
    app_metadata: { role },
    user_metadata: { display_name: role === "admin" ? "Test Admin" : "Test Manager" },
  };
  const session = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript(({ session }) => {
    localStorage.setItem("digital-vision-manager-auth", JSON.stringify(session));
    localStorage.setItem("sb-qwyquvufneolyesfiipf-auth-token", JSON.stringify(session));
    sessionStorage.setItem("dv-manager-view:" + session.user.id + ":business-1", "qr");
  }, { session });

  await page.route("https://qwyquvufneolyesfiipf.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body, status = 200, headers = {}) => route.fulfill({
      status,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    });
    if (path.endsWith("/auth/v1/user")) return json(user);
    if (path.endsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (path.endsWith("/rest/v1/modules")) return json(modules);
    if (path.endsWith("/rest/v1/businesses")) {
      if (role === "admin" && !url.searchParams.has("id")) return json([business]);
      return json(business);
    }
    if (path.endsWith("/rest/v1/business_members")) {
      return url.searchParams.has("user_id") ? json(membership) : json([membership]);
    }
    if (path.endsWith("/rest/v1/business_modules")) return json(enabledRows);
    if (path.endsWith("/rest/v1/restaurant_tables")) return json([]);
    if (path.endsWith("/rest/v1/orders")) return json([]);
    if (path.endsWith("/rest/v1/order_items")) return json([]);
    if (path.endsWith("/rest/v1/catalog_items")) return json([]);
    if (path.endsWith("/rest/v1/catalog_categories")) return json([]);
    if (path.endsWith("/rest/v1/customers")) return json([]);
    if (path.endsWith("/rest/v1/restaurant_offers")) return json([]);
    if (path.endsWith("/rest/v1/restaurant_settings")) return json([]);
    if (path.endsWith("/rest/v1/manager_inquiries")) return json([]);
    return json([]);
  });
}

test("Manager shell mounts before slow business context returns", async ({ page }) => {
  await installSupabaseMocks(page);
  let releaseBusiness;
  const businessGate = new Promise((resolve) => { releaseBusiness = resolve; });
  await page.route("https://qwyquvufneolyesfiipf.supabase.co/rest/v1/businesses**", async (route) => {
    await businessGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(business) });
  });
  await page.goto("/?login=manager");
  await expect(page.locator(".manager-shell")).toBeVisible();
  await expect(page.locator("#managerSignout")).toBeVisible();
  releaseBusiness();
  await expect(page.locator(".manager-pagehead")).toContainText("Restaurant tables");
});

test("Manager navigation changes sections without remounting the shell", async ({ page }) => {
  await installSupabaseMocks(page);
  await page.goto("/?login=manager");
  await expect(page.locator(".manager-shell")).toBeVisible();
  await expect(page.locator(".manager-pagehead")).toContainText("Restaurant tables");
  await page.evaluate(() => { window.__managerShell = document.querySelector(".manager-shell"); });
  await page.getByRole("button", { name: /Orders/ }).first().click();
  await expect(page.locator(".manager-top h1")).toHaveText("Orders");
  await expect(page.locator(".manager-shell")).toHaveCount(1);
  expect(await page.evaluate(() => window.__managerShell === document.querySelector(".manager-shell"))).toBe(true);
  await expect(page.locator(".manager-content")).not.toContainText("Loading Orders");
});

test("Manager top-bar sign out returns to the sign-in screen", async ({ page }) => {
  await installSupabaseMocks(page);
  await page.goto("/?login=manager");
  await expect(page.locator("#managerTopSignout")).toBeVisible();
  await page.locator("#managerTopSignout").click();
  await expect(page.locator("#unifiedLogin")).toBeVisible();
});

test("Super Admin portal boots in a real browser", async ({ page }) => {
  await installSupabaseMocks(page, "admin");
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".topbar h1")).toHaveText("Overview");
});

test("Customer menu portal handles a real browser request", async ({ page }) => {
  await page.route("https://qwyquvufneolyesfiipf.supabase.co/functions/v1/public-menu**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business: { name: "Browser Test Cafe" },
        table: { label: "Table 1" },
        items: [],
        categories: [],
        offers: [],
        settings: { menu_theme: "platinum-premium", customer_ordering_enabled: false, gst_rate: 0 },
      }),
    });
  });
  await page.goto("/?menu=browser-test-cafe&table=test-token");
  await expect(page.locator(".customer-menu-page")).toContainText("Browser Test Cafe");
  await expect(page.locator(".customer-menu-page")).toContainText("Table 1");
});
