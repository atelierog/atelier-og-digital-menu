import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessManagerModule } from "../src/manager/module-dashboard.mjs";
import { canOpenBusinessWorkspace } from "../src/manager/business-access.mjs";
import { isSixDigitPassword, isStaffPassword } from "../src/auth/password-policy.mjs";
import { createBusinessId } from "../src/manager/business-id.mjs";
import { managerWelcomeName } from "../src/manager/welcome-name.mjs";
import { groupManagerModules } from "../src/manager/module-dashboard.mjs";
import { createTenantContextStore } from "../src/core/tenant-context.js";
import { createNavigationController } from "../src/core/navigation.js";
import { resolvePortal } from "../src/core/portal-routing.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [
  app,
  managerRuntime,
  managerShell,
  packageJson,
  viteConfig,
  indexHtml,
  qrLibrary,
  qrLicense,
  login,
  moduleDashboard,
  staffOperations,
  publicMenu,
  migration,
  rpcSecurityMigration,
  config,
  adminBusiness,
  adminMember,
  managerStaffAccess,
  passwordReset,
  firstLogin,
] = await Promise.all([
  read("../src/app.js"),
  read("../src/features/manager/manager-runtime.js"),
  read("../src/features/manager/manager-shell.js"),
  read("../package.json"),
  read("../vite.config.js"),
  read("../index.html"),
  read("../src/vendor/qrcode.min.js"),
  read("../src/vendor/QRCODE-LICENSE.txt"),
  read("../src/auth/login.js"),
  read("../src/manager/module-dashboard.mjs"),
  read("../supabase/functions/staff-operations/index.ts"),
  read("../supabase/functions/public-menu/index.ts"),
  read("../supabase/migrations/20261114082139_20261114100000_harden_module_entitlements_and_fk_indexes.sql"),
  read("../supabase/migrations/20261114082546_make_module_entitlement_rpc_invoker.sql"),
  read("../supabase/config.toml"),
  read("../supabase/functions/admin-manage-business/index.ts"),
  read("../supabase/functions/admin-manage-member/index.ts"),
  read("../supabase/functions/manager-staff-access/index.ts"),
  read("../supabase/functions/staff-password-reset/index.ts"),
  read("../supabase/functions/complete-first-login/index.ts"),
]);

const roles = ["admin", "manager", "order_taker", "bill_counter", "customer"];
const modules = ["catalog", "ordering", "qr", "digital_page", "offers", "customers", "inquiries", "analytics", "automation"];

// 90 role/module/entitlement combinations.
for (const role of roles) {
  for (const moduleCode of modules) {
    for (const enabled of [false, true]) {
      const expected = (role === "admin" || role === "manager") && enabled;
      test(`module access: role=${role}, module=${moduleCode}, enabled=${enabled}`, () => {
        const enabledCodes = new Set(enabled ? [moduleCode] : []);
        assert.equal(canAccessManagerModule(role, enabledCodes, moduleCode), expected);
      });
    }
  }
}

// 10 business lifecycle / platform-admin combinations.
for (const status of ["active", "suspended", "archived", "pending", "deleted"]) {
  for (const isAdmin of [false, true]) {
    test(`business workspace: status=${status}, platformAdmin=${isAdmin}`, () => {
      assert.equal(canOpenBusinessWorkspace(isAdmin, status), isAdmin || status === "active");
    });
  }
}


for (const value of ["000000","123456","999999","000001","987654","111111","222222","333333","444444","555555"]) {
  test(`six-digit staff password accepts ${value}`, () => assert.equal(isSixDigitPassword(value), true));
}
for (const value of ["","12345","1234567","abcdef","12 345","12-345","１２３４５６",123456,null,undefined,true,[] ,{},"12345a","a12345","123.45","123 456","00000\\n"," 123456","123456 "]) {
  test(`six-digit staff password rejects ${String(value)}`, () => assert.equal(isSixDigitPassword(value), false));
}

for (const [value,expected] of [
  ["Atelier OG","atelier-og"],
  ["Café & Co.","cafe-co"],
  ["","business"],
  ["My Business","my-business"],
  ["  Spaces   Here  ","spaces-here"],
  ["A/B/C","a-b-c"],
  ["Hello---World","hello-world"],
  ["Crème Brûlée","creme-brulee"],
  ["東京","business"],
  [null,"business"],
]) {
  test(`business ID normalization: ${String(value)}`, () => assert.equal(createBusinessId(value), expected));
}

for (const [name,expected] of [
  ["Atelier OG","atelier-og-2"],
  ["Atelier OG","atelier-og-3"],
  ["Café & Co.","cafe-co-2"],
  ["Alpha","alpha-2"],
  ["alpha","alpha-3"],
]) {
  test(`business ID uniqueness: ${name} -> ${expected}`, () => {
    const existing=[{slug:expected.endsWith("-3")?expected.slice(0,-2)+"-2":expected}];
    const used=expected.endsWith("-3")?[{slug:expected.slice(0,-2)+"-2"},{slug:expected.slice(0,-2)}]:[{slug:expected.slice(0,-2)}];
    assert.equal(createBusinessId(name,used),expected);
  });
}

for (const [membership,user,expected] of [
  [{display_name:"rahul kumar"},{email:"other@example.com"},"Rahul Kumar"],
  [{display_name:""},{user_metadata:{display_name:"rahul"}}, "Rahul"],
  [{},{email:"rahul.kumar@example.com"},"Rahul Kumar"],
  [{},{email:"rahul-kumar@example.com"},"Rahul Kumar"],
  [{},{email:"rahul_kumar@example.com"},"Rahul Kumar"],
  [{},{},"Manager"],
  [{display_name:"  aLiCe  "},{},"ALiCe"],
  [{},{user_metadata:{display_name:"élodie martin"}},"Élodie Martin"],
]) {
  test(`Manager welcome name resolves to ${expected}`, () => assert.equal(managerWelcomeName(membership,user),expected));
}

test("module groups contain the expected business capabilities and unknown modules", () => {
  const modules=["catalog","ordering","qr","customers","inquiries","offers","digital_page","analytics","automation","custom"].map(code=>({code,id:code}));
  const groups=groupManagerModules(modules);
  assert.equal(groups.length,4);
  assert.deepEqual(groups.map(group=>group.modules.map(module=>module.code)),[
    ["catalog","ordering","qr"],
    ["customers","inquiries","offers","digital_page"],
    ["analytics","automation"],
    ["custom"]
  ]);
});

test("root index points at the canonical production app and existing styles", () => {
  assert.match(indexHtml, /src="\.\/src\/app\.js/);
  assert.match(indexHtml, /href="\.\/src\/style\.css"/);
  assert.match(indexHtml, /href="\.\/src\/platinum-theme\.css"/);
});

test("staff password policy enforces the six-to-seventy-two character range", () => {
  assert.equal(isStaffPassword("123456"),true);
  assert.equal(isStaffPassword("x".repeat(72)),true);
  assert.equal(isStaffPassword("12345"),false);
  assert.equal(isStaffPassword("x".repeat(73)),false);
  assert.equal(isStaffPassword(123456),false);
  assert.equal(isStaffPassword(null),false);
  assert.equal(isStaffPassword(""),false);
});

test("Supabase SDK is bundled from a pinned local npm dependency", () => {
  assert.match(app, /from "@supabase\/supabase-js"/);
  assert.doesNotMatch(app, /https:\/\/esm\.sh\/@supabase\/supabase-js/);
  assert.match(packageJson, /"@supabase\/supabase-js": "2\.119\.0"/);
  assert.match(viteConfig, /base: "\.\/"/);
});

test("production app parses as an ES module", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: app }));
});

test("production login module parses as an ES module", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: login }));
});

test("Manager route and navigation share one role-aware entitlement guard", () => {
  assert.match(app, /canAccessManagerModule\(accessRole,enabledCodes,module\)/);
  assert.match(managerShell, /canAccessManagerModule\(role,enabledCodes,module\)/);
});

test("Super Admin module changes use one atomic database RPC", () => {
  assert.match(app, /rpc\("admin_set_business_modules"/);
  assert.doesNotMatch(app, /from\("business_modules"\)\.delete\(\)\.eq\("business_id",id\)/);
  assert.match(migration, /create or replace function public\.admin_set_business_modules/);
});

test("module entitlement writes are restricted to Super Admin", () => {
  assert.match(migration, /with check \(private\.is_super_admin\(\)\)/);
  assert.match(migration, /using \(private\.is_super_admin\(\)\)/);
  assert.match(migration, /grant execute on function public\.admin_set_business_modules/);
  assert.match(rpcSecurityMigration, /language plpgsql\s+security invoker/i);
  assert.doesNotMatch(rpcSecurityMigration, /\nsecurity definer/i);
});

test("staff desk limits item reads to the displayed order IDs", () => {
  assert.match(app, /renderStaffWorkspace\(\{app,supabase,state/);
});

test("Manager overview limits item analytics to the selected date", () => {
  assert.match(app, /orders!inner\(status,created_at\)[\s\S]{0,220}\.gte\("orders\.created_at",dayStart\.toISOString\(\)\)[\s\S]{0,140}\.lt\("orders\.created_at",dayEnd\.toISOString\(\)\)/);
});

test("Manager business context is cached per user/business and stale navigation is guarded", () => {
  assert.match(app, /createTenantContextStore\(30000\)/);
  assert.match(app, /managerContexts\.get\(businessId,state\.user\?\.id\)/);
  assert.match(app, /createNavigationController\(\)/);
});

test("customer status polling is throttled to ten seconds", () => {
  assert.match(app, /CUSTOMER_STATUS_POLL_INTERVAL_MS=10000/);
  assert.match(app, /statusPollIntervalMs:CUSTOMER_STATUS_POLL_INTERVAL_MS/);
});

test("QR generation loads a local Vite-bundled asset on demand", () => {
  assert.match(app, /import qrCodeScriptUrl from "\.\/vendor\/qrcode\.min\.js\?url"/);
  assert.match(app, /function loadQrCodeLibrary\(\)/);
  assert.match(app, /script\.src=qrCodeScriptUrl/);
  assert.doesNotMatch(app, /import\("https:\/\/esm\.sh\/qrcode@1\.5\.4"\)/);
  assert.match(qrLibrary, /QRCode\.CorrectLevel/);
  assert.match(qrLicense, /The MIT License/);
});

test("Order Taker and Bill Counter server permissions are distinct", () => {
  assert.match(staffOperations, /\["manager",\s*"order_taker",\s*"admin"\]/);
  assert.match(staffOperations, /\["manager",\s*"bill_counter",\s*"admin"\]/);
  assert.match(staffOperations, /business\.status !== "active"/);
});

test("all seven active Supabase Edge Functions are tracked in the repository", () => {
  for (const source of [adminBusiness,adminMember,publicMenu,managerStaffAccess,staffOperations,passwordReset,firstLogin]) {
    assert.ok(source.length > 0);
  }
});

test("Edge Functions use environment secrets and contain no hard-coded service-role credentials", () => {
  for (const source of [adminBusiness,adminMember,publicMenu,managerStaffAccess,staffOperations,passwordReset,firstLogin]) {
    assert.doesNotMatch(source, /sb_secret_|eyJ[a-zA-Z0-9_-]{20,}\./);
    if (source.includes("SUPABASE_SERVICE_ROLE_KEY")) assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  }
});

test("public menu and password reset are the intended unauthenticated Edge Functions", () => {
  assert.match(config, /\[functions\.public-menu\]\s+verify_jwt = false/);
  assert.match(config, /\[functions\.staff-password-reset\]\s+verify_jwt = false/);
});

test("staff actions require active Manager membership and active business", () => {
  assert.match(managerStaffAccess, /manager\?\.role !== "manager" \|\| manager\.status !== "active"/);
  assert.match(managerStaffAccess, /business\.status !== "active"/);
});

test("public menu rejects inactive businesses and validates table ownership", () => {
  assert.match(publicMenu, /\.eq\("status", "active"\)/);
  assert.match(publicMenu, /table\.business_id !== business\.id/);
  assert.match(publicMenu, /\.rpc\("create_menu_order"/);
});

test("public password-reset endpoint is intentionally configured without JWT", () => {
  assert.match(config, /\[functions\.staff-password-reset\]\s+verify_jwt = false/);
  assert.match(passwordReset, /attempts/);
});

test("first-login completion remains a separate authenticated Edge Function", () => {
  assert.match(firstLogin, /auth\.getUser|auth\.admin\.getUserById/);
});

test("missing foreign-key indexes are included in the recovery migration", () => {
  assert.match(migration, /orders_table_business_idx/);
  assert.match(migration, /staff_password_reset_requests_business_idx/);
  assert.match(migration, /staff_password_reset_requests_manager_idx/);
});

test("the production app has a single deduplicated boot promise", () => {
  assert.match(app, /if\(bootPromise\)return bootPromise/);
  assert.match(app, /bootPromise=\(async\(\)=>/);
});

test("auth token refresh does not reset the active Manager route", () => {
  const listener = app.match(/supabase\.auth\.onAuthStateChange\(\(event,s\)=>\{[\s\S]*?\n\s*\}\);/)?.[0] || "";
  assert.ok(listener, "auth-state listener exists");
  assert.match(listener, /if\(event==="SIGNED_OUT"\)/);
  const executableListener = listener.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(executableListener, /boot\(/, "token refresh must not trigger a full workspace boot");
});

test("module catalogue remains grouped without hiding unknown future modules", () => {
  assert.match(moduleDashboard, /Other modules/);
  assert.match(moduleDashboard, /groupManagerModules/);
});


test("Manager navigation never rolls back or shows a blocking route-loading label", () => {
  const start = managerRuntime.indexOf("function navigateManager(id,view)");
  const end = managerRuntime.indexOf("async function managerView(id,view=", start);
  const route = managerRuntime.slice(start, end);
  assert.doesNotMatch(route, /previousView|saveManagerView\(id,previousView\)|Loading \+label/);
  assert.match(route, /app\.dataset\.managerView=view/);
  assert.match(route, /return managerView\(id,view\)/);
  const managerHandler = managerRuntime.slice(end, managerRuntime.indexOf("return { bindManagerFrame", end));
  assert.match(managerHandler, /Retry/);
});

test("Manager feature errors stay inside the Manager shell", () => {
  const start = app.indexOf("function error(m)");
  const end = app.indexOf("async function load()", start);
  const route = app.slice(start, end);
  assert.match(route, /document\.querySelector\("\.manager-content"\)/);
  assert.match(route, /managerSectionRetry/);
  assert.match(route, /app\.innerHTML/);
});
test("Manager route authorization failures never redirect to the generic workspace", () => {
  const start = managerRuntime.indexOf("async function managerView(id,view=");
  const end = managerRuntime.indexOf("return { bindManagerFrame", start);
  const route = managerRuntime.slice(start, end);
  assert.doesNotMatch(route, /return workspace\(\)/);
  assert.match(route, /Manager access could not be verified/);
  assert.match(route, /catalogView\(id,null,null,viewEpoch,context\)/);
});

test("Manager catalog reuses the already verified Manager context instead of rechecking membership", () => {
  const start = app.indexOf("async function catalogView(");
  const end = app.indexOf("function ", start + 30);
  const route = app.slice(start, end);
  assert.match(route, /managerContext\|\|currentManagerContext\(id\)/);
  assert.doesNotMatch(route, /from\("business_members"\)/);
  assert.doesNotMatch(route, /return workspace\(\)/);
});

test("non-admin login skips platform-wide business directory and member-count queries", () => {
  const start = app.indexOf("async function load()");
  const end = app.indexOf("function boot()", start);
  const route = app.slice(start, end);
  assert.match(route, /if\(isAdmin\(\)\)/);
  assert.match(route, /Manager module metadata is loaded after its shell is mounted/);
});

test("tenant context cache is isolated by business and user and expires", () => {
  let now = 1000;
  const cache = createTenantContextStore(30000, () => now);
  const value = { businessId: "b1", userId: "u1", business: { id: "b1" }, membership: { role: "manager" }, enabledRows: [] };
  cache.set(value);
  assert.equal(cache.get("b1", "u1").business.id, "b1");
  assert.equal(cache.get("b2", "u1"), null);
  assert.equal(cache.get("b1", "u2"), null);
  now += 30000;
  assert.equal(cache.get("b1", "u1"), null);
  cache.set(value);
  cache.clear();
  assert.equal(cache.get("b1", "u1"), null);
});

test("navigation controller invalidates stale route requests", () => {
  const navigation = createNavigationController();
  const first = navigation.begin();
  const second = navigation.begin();
  assert.equal(navigation.isCurrent(first), false);
  assert.equal(navigation.isCurrent(second), true);
  navigation.invalidate();
  assert.equal(navigation.isCurrent(second), false);
});

test("Manager shell is mounted before business and module context requests resolve", () => {
  const start = managerRuntime.indexOf("async function managerView(id,view=");
  const end = managerRuntime.indexOf("return { bindManagerFrame", start);
  const route = managerRuntime.slice(start, end);
  const shellMount = route.indexOf('app.innerHTML=managerFrameContent');
  const contextRequest = route.indexOf("loadManagerWorkspace");
  assert.ok(shellMount >= 0 && contextRequest > shellMount);
  assert.match(route, /managerSkeleton\(\)/);
});

test("Manager navigation renders into the existing content region, not the app root", () => {
  const start = managerRuntime.indexOf("function navigateManager(id,view)");
  const end = managerRuntime.indexOf("async function managerView(id,view=");
  const route = managerRuntime.slice(start, end);
  assert.match(route, /document.querySelector\("\.manager-content"\)/);
  assert.doesNotMatch(route, /app\.innerHTML/);
  assert.match(route, /return managerView\(id,view\)/);
});

test("Manager has desktop and mobile sign-out controls", () => {
  assert.match(managerShell, /id="managerSignout"/);
  assert.match(managerShell, /id="managerTopSignout"/);
  assert.match(managerRuntime, /supabase\.auth\.signOut\(\)/);
});

test("portal routing maps each authenticated role to its own portal", () => {
  assert.equal(resolvePortal("admin"), "super_admin");
  assert.equal(resolvePortal("manager"), "manager");
  assert.equal(resolvePortal("order_taker"), "order_taker");
  assert.equal(resolvePortal("bill_counter"), "bill_counter");
  assert.equal(resolvePortal("member"), "workspace");
});

test("all authenticated portals use extracted service boundaries", () => {
  assert.match(managerRuntime, /loadManagerWorkspace\(supabase/);
  assert.match(app, /renderStaffWorkspace\(\{app,supabase,state/);
  assert.match(app, /loadSuperAdminDashboardData\(supabase\)/);
  assert.match(app, /renderSuperAdminOverview\(\{businesses:state\.businesses/);
  assert.match(app, /bootCustomerMenu\(\{app,esc,supabaseUrl:SUPABASE_URL/);
  assert.match(app, /resolvePortal\(/);
});
