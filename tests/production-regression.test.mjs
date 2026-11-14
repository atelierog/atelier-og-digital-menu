import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessManagerModule } from "../src/src/manager/module-dashboard.mjs";
import { canOpenBusinessWorkspace } from "../src/src/manager/business-access.mjs";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [
  app,
  login,
  moduleDashboard,
  staffOperations,
  publicMenu,
  migration,
  config,
  managerStaffAccess,
  passwordReset,
  firstLogin,
] = await Promise.all([
  read("../src/app.js"),
  read("../src/src/auth/login.js"),
  read("../src/src/manager/module-dashboard.mjs"),
  read("../supabase/functions/staff-operations/index.ts"),
  read("../supabase/functions/public-menu/index.ts"),
  read("../supabase/migrations/20261114100000_harden_module_entitlements_and_fk_indexes.sql"),
  read("../supabase/config.toml"),
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

test("production app parses as an ES module", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: app }));
});

test("production login module parses as an ES module", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: login }));
});

test("Manager route and navigation share one role-aware entitlement guard", () => {
  assert.match(app, /canAccessManagerModule\(accessRole,enabledCodes,module\)/);
  assert.match(app, /canAccessManagerModule\(role,enabledCodes,module\)/);
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
});

test("staff desk limits item reads to the displayed order IDs", () => {
  assert.match(app, /orderIds\.length[\s\S]{0,220}\.in\("order_id",orderIds\)/);
});

test("Manager overview limits item analytics to the selected date", () => {
  assert.match(app, /orders!inner\(status,created_at\)[\s\S]{0,220}\.gte\("orders\.created_at",dayStart\.toISOString\(\)\)[\s\S]{0,140}\.lt\("orders\.created_at",dayEnd\.toISOString\(\)\)/);
});

test("customer status polling is throttled to ten seconds", () => {
  assert.match(app, /CUSTOMER_STATUS_POLL_INTERVAL_MS=10000/);
  assert.match(app, /setInterval\(refresh,CUSTOMER_STATUS_POLL_INTERVAL_MS\)/);
});

test("QR generation dependency is visible for follow-up bundling", () => {
  assert.match(app, /import\("https:\/\/esm\.sh\/qrcode@1\.5\.4"\)/);
});

test("Order Taker and Bill Counter server permissions are distinct", () => {
  assert.match(staffOperations, /\["manager",\s*"order_taker",\s*"admin"\]/);
  assert.match(staffOperations, /\["manager",\s*"bill_counter",\s*"admin"\]/);
  assert.match(staffOperations, /business\.status !== "active"/);
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
