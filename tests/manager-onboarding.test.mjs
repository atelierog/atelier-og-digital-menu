import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSixDigitPassword } from "../src/auth/password-policy.mjs";
import { createBusinessId } from "../src/manager/business-id.mjs";
import { canOpenBusinessWorkspace } from "../src/manager/business-access.mjs";
import { managerWelcomeName } from "../src/manager/welcome-name.mjs";
import { groupManagerModules, isManagerModuleAvailable } from "../src/manager/module-dashboard.mjs";

const [appSource, authSource, memberFunction, themeSource, publicMenuFunction] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/auth/login.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/admin-manage-member/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../platinum-theme.css", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/public-menu/index.ts", import.meta.url), "utf8"),
]);

const successPasswords = ["000000", "111111", "123456", "654321", "999999", "010203", "202604", "909090", "555555", "808080"];
for (const value of successPasswords) {
  test(`accepts six-digit password ${value}`, () => assert.equal(isSixDigitPassword(value), true));
}

const businessNames = ["Sun Lise", "Digital Vision", "Atelier OG", "Café Noir", "Jewel & Joy", "C++ Salon", "Store_One", "  north  ", "", "x".repeat(120)];
for (const name of businessNames) {
  test(`creates a valid Business ID from ${JSON.stringify(name)}`, () => {
    const id = createBusinessId(name);
    assert.match(id, /^[a-z0-9-]+$/);
    assert.ok(id.length <= 80);
  });
}

const welcomeCases = [
  [{ display_name: "Rudra" }, {}, "Rudra"],
  [{ display_name: "rahul kumar" }, {}, "Rahul Kumar"],
  [{ display_name: "R. Das" }, {}, "R. Das"],
  [{ display_name: "" }, { user_metadata: { display_name: "Mira Sen" } }, "Mira Sen"],
  [null, { user_metadata: { display_name: "dev" } }, "Dev"],
  [null, { email: "mira.sen@example.com" }, "Mira Sen"],
  [{ display_name: "  Zoë  " }, {}, "Zoë"],
  [null, { email: "RAHUL-KUMAR@example.com" }, "RAHUL KUMAR"],
  [null, {}, "Manager"],
  [{ display_name: "DEVI" }, { user_metadata: { display_name: "Ignored" } }, "DEVI"],
];
for (const [membership, user, expected] of welcomeCases) {
  test(`greets the manager as ${expected}`, () => assert.equal(managerWelcomeName(membership, user), expected));
}

const invalidPasswords = [
  "", "1", "12345", "1234567", "abcdef", "12ab56", "123-56", "123 56", " 123456", "123456 ",
  "１２３４５６", "١٢٣٤٥٦", null, undefined, false, true, 123456, "12345.6", "12345\n", "12345!",
];
for (const value of invalidPasswords) {
  test(`rejects invalid password ${JSON.stringify(value)}`, () => assert.equal(isSixDigitPassword(value), false));
}

const managerRoles = JSON.parse(memberFunction.match(/const managerStaffRoles = (\[[^\]]+\]);/)?.[1] ?? "null");
assert.ok(Array.isArray(managerRoles), "Manager staff roles must remain explicit in the server function");
assert.match(memberFunction, /if\s*\(!managerStaffRoles\.includes\(role\)\)[\s\S]{0,120}status:\s*403/);
const roleCases = [
  ["order_taker", true], ["bill_counter", true], ["manager", false], ["owner", false], ["staff", false],
  ["admin", false], ["customer", false], ["super_admin", false], ["platform_admin", false], ["", false],
  [null, false], [undefined, false], [0, false], [true, false], ["order-taker", false],
];
for (const [role, expected] of roleCases) {
  test(`manager role boundary for ${String(role)}`, () => assert.equal(managerRoles.includes(role), expected));
}

const lifecycleCases = [
  ["platform admin", "active", true], ["manager", "active", true], ["order_taker", "active", true],
  ["platform admin", "suspended", true], ["manager", "suspended", false], ["order_taker", "suspended", false],
  ["platform admin", "archived", true], ["manager", "archived", false], ["order_taker", "archived", false],
  ["platform admin", "pending", true], ["manager", "pending", false], ["order_taker", "pending", false],
  ["platform admin", "deleted", true], ["manager", "deleted", false], ["order_taker", "deleted", false],
];
assert.match(appSource, /canOpenBusinessWorkspace\(isAdmin\(\),\s*b\.status\)/);
for (const [role, status, expected] of lifecycleCases) {
  test(`${role} business access for ${status}`, () => assert.equal(canOpenBusinessWorkspace(role === "platform admin", status), expected));
}

const collisionNames = ["Sun Lise", "Digital Vision", "Atelier OG", "Café Noir", "Jewel & Joy", "C++ Salon", "Store_One", "north", "", "x".repeat(120)];
for (const name of collisionNames) {
  test(`generates a unique retry ID for ${JSON.stringify(name)}`, () => {
    const first = createBusinessId(name);
    const hasRoomForSecondSuffix = first.length <= 77;
    const existing = hasRoomForSecondSuffix ? [{ slug: first }, { slug: `${first}-2` }] : [{ slug: first }];
    const retry = createBusinessId(name, existing);
    const suffix = hasRoomForSecondSuffix ? "-3" : "-2";
    assert.equal(retry, `${first.slice(0, 80 - suffix.length).replace(/-+$/g, "")}${suffix}`);
    assert.notEqual(retry, first);
  });
}

const moduleGroups = groupManagerModules([
  { code: "catalog", name: "Catalog" }, { code: "qr", name: "QR" }, { code: "ordering", name: "Ordering" },
  { code: "customers", name: "Customers" }, { code: "digital_page", name: "Digital Page" },
  { code: "offers", name: "Offers" }, { code: "inquiries", name: "Inquiries" },
  { code: "analytics", name: "Analytics" }, { code: "automation", name: "Automation" },
]);
test("groups restaurant operations together", () => assert.deepEqual(moduleGroups[0].modules.map(module => module.code), ["catalog", "ordering", "qr"]));
test("groups customer and growth tools together", () => assert.deepEqual(moduleGroups[1].modules.map(module => module.code), ["customers", "inquiries", "offers", "digital_page"]));
test("groups insights and automation together", () => assert.deepEqual(moduleGroups[2].modules.map(module => module.code), ["analytics", "automation"]));
test("keeps unknown future modules visible", () => assert.equal(groupManagerModules([{ code: "new_tool", name: "New tool" }])[0].title, "Other modules"));
test("renders no empty group when no modules are enabled", () => assert.deepEqual(groupManagerModules([]), []));
test("Catalog is the only currently available Manager module", () => {
  assert.equal(isManagerModuleAvailable("catalog"), true);
  for (const code of ["ordering", "qr", "customers", "digital_page", "offers", "inquiries", "analytics", "automation"]) {
    assert.equal(isManagerModuleAvailable(code), false);
  }
});

const regressionChecks = [
  ["first-login password fields use six-digit inputs", /passwordInputMarkup\("firstNewPassword"[^\n]+true\)/],
  ["first-login confirmation uses six-digit input", /passwordInputMarkup\("firstConfirmPassword"[^\n]+true\)/],
  ["recovery password fields use six-digit inputs", /passwordInputMarkup\("newPassword"[^\n]+true\)/],
  ["recovery confirmation uses six-digit input", /passwordInputMarkup\("confirmPassword"[^\n]+true\)/],
  ["six-digit controls have numeric keyboard and exact pattern", /inputmode="numeric" pattern="\[0-9\]\{6\}" minlength="6" maxlength="6"/],
  ["show and hide controls expose accessible state", /aria-label="Show password" aria-pressed="false"/],
  ["mobile theme retains the visible password toggle", /\.password-toggle\{[^}]*width:34px/],
  ["password text does not overlap the toggle", /\.password-field input\{padding-right:48px\}/],
  ["business ID remains a required generated field", /id="bslug" required[^\n]+readonly/],
  ["Manager name is required and used in the greeting", /id="managerName" required/],
  ["Manager modules render in workflow groups", /groupManagerModules\(mods\)[\s\S]{0,250}module-section/],
  ["unavailable modules are clearly labeled", /Not available yet/],
  ["Manager accounts open the business dashboard", /if\(role==="manager"\)return managerView\(id,"overview"\)/],
  ["Manager navigation is filtered by business entitlements", /const available=\(page,module\)=>!module\|\|enabledCodes\.has\(module\)/],
  ["Manager welcome uses the saved display name", /Welcome, '\+esc\(name\)/],
  ["dashboard totals come from live order rows", /const total=todays\.reduce\(\(n,x\)=>n\+Number\(x\.total\|\|0\)/],
  ["dashboard reports most and least ordered items", /Most ordered[\s\S]{0,200}Least ordered/],
  ["order view includes item snapshots and customer details", /order_items"\)\.select\("order_id,item_name,quantity,unit_price,line_total"/],
  ["Manager can accept or reject new orders", /data-order-status="accepted"[\s\S]{0,180}data-order-status="cancelled"/],
  ["receipt avoids claiming configured taxes", /not a tax invoice\. Final tax and payment details will appear after restaurant billing settings are configured/],
  ["analytics provides a downloadable CSV", /downloadReport[\s\S]{0,1500}text\/csv;charset=utf-8/],
  ["catalog accepts bounded image uploads", /image\/jpeg","image\/png","image\/webp"\]\.[^\n]{0,180}8\*1024\*1024/],
  ["product uploads are namespaced by business", /const objectPath=id\+"\/products\/"\+crypto\.randomUUID\(\)/],
  ["Manager theme has responsive mobile navigation", /\.manager-mobile-nav\{position:fixed[\s\S]{0,350}grid-template-columns:repeat\(5,1fr\)/],
  ["Super Admin shell remains a separate render path", /const role=isAdmin\(\)\?"platform admin":[\s\S]{0,100}if\(role==="manager"\)return managerView/],
  ["table QR customer links open the public menu route", /location\.origin\+"\/\?menu="/],
  ["customer menu supports search, categories and cart", /id="menuSearch"[\s\S]{0,1200}data-add-item/],
  ["customer checkout calls the secure order endpoint", /action=order[\s\S]{0,300}customer_name/],
  ["customer receipt follows order status with its tracking token", /action=status&token=/],
];
for (const [name, pattern] of regressionChecks) {
  test(`UI regression: ${name}`, () => assert.match(name.includes("theme") || name.includes("overlap") ? themeSource : appSource + authSource, pattern));
}
test("public menu computes prices from active catalog data on the server", () => {
  assert.match(publicMenuFunction, /\.from\("catalog_items"\)\.select\("id,name,price"\)/);
  assert.match(publicMenuFunction, /const total = round\(taxable \+ tax\)/);
  assert.match(publicMenuFunction, /\.rpc\("create_menu_order"/);
});
test("public order input is bounded and table scoped", () => {
  assert.match(publicMenuFunction, /body\.items\.length > 30/);
  assert.match(publicMenuFunction, /table\.business_id !== business\.id/);
  assert.match(publicMenuFunction, /next > 20/);
});

