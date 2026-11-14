# Digital Vision — recovered production architecture

## Scope and source map

This document describes the production application recovered from the current Vercel deployment and the live Supabase project. It is not a proposed visual redesign. The current website styling is preserved.

- Production domain: `https://digitalvision.atelierog.co.in`
- Vercel project: `digital-vision-atelier-og`
- Supabase project: `qwyquvufneolyesfiipf`
- Recovery branch: `release/digital-vision-unified`
- Canonical repository root:
  - `index.html` — production entry point
  - `package.json`, `vite.config.js`, `vercel.json` — pinned dependencies and Vercel build configuration
- Production frontend source under `src/`:
  - `src/app.js`
  - `src/auth/*`
  - `src/manager/*`
  - `src/style.css` and `src/platinum-theme.css`
  - `src/manifest.webmanifest` and `src/icons/*`
  - `src/vendor/qrcode.min.js` (locally bundled QR generator)

The recovery branch now uses one canonical repository root. The old root-level app and styles have been removed from this branch; the original integration branch remains available as the legacy reference.

## Runtime architecture

### 1. Authentication and session

1. Supabase Auth authenticates the account.
2. `src/app.js` calls a single `boot()` guarded by `bootPromise`.
3. `load()` resolves the current user, platform role, businesses, module catalogue and member count.
4. The auth-state listener handles sign-out and recovery flow; it does not re-run the whole boot on token refresh.
5. Sign-in forms call `boot()` after successful authentication.
6. `@supabase/supabase-js` is pinned in `src/package.json` and bundled into the production assets by Vite; the browser no longer needs to fetch the Supabase SDK from `esm.sh` at runtime.
6. First-login password change is completed through the authenticated `complete-first-login` Edge Function.

Platform role is read from Auth app metadata (`role=admin`). Business roles are stored in `business_members` and scoped by `business_id`.

### 2. Tenant and module context

- A business is the tenant.
- `business_members` binds a user to a business and role.
- `business_modules` binds enabled module IDs to a business.
- `modules` is the platform module catalogue.
- Business-scoped records carry `business_id`; composite foreign keys protect relationships such as order-to-table and order-to-customer.
- Frontend visibility is not authorization. RLS and Edge Functions must enforce the same tenant and role boundaries.

The Manager route uses the business's enabled module codes. The helper `isManagerModuleAvailable()` is used by the generic workspace/module-card fallback; it is not the Manager route gate. Manager navigation is governed by `business_modules` and `managerView()`.

### 3. Role workspaces

| Role | Workspace and permitted operations |
|---|---|
| Super Admin | Platform overview, businesses, lifecycle actions and module entitlements |
| Manager | One assigned active business, enabled business modules, catalogue, digital page, tables/QR, orders, offers, customers, inquiries, reports, automation and team access |
| Order Taker | Read the business order queue; accept/reject new orders; mark accepted/processing orders delivered |
| Bill Counter | Read accepted/processing/delivered orders, open/print receipts and record payment |
| Customer/public | Open a published menu through business slug + active table QR token, place an order and track it using the order tracking token |

### 4. Backend command boundaries

- `admin-manage-business`: Super Admin-only business lifecycle actions.
- `admin-manage-member`: authenticated member/manager provisioning with role checks.
- `complete-first-login`: authenticated first-login completion.
- `manager-staff-access`: Manager-only staff creation, reset, username conversion and removal.
- `staff-operations`: role-checked order status and payment commands.
- `staff-password-reset`: public reset-request flow protected by staff ID, short-lived HMAC code, attempt limit and one-minute request throttling. JWT verification is disabled intentionally.
- `public-menu`: public menu/order/status API. JWT verification is disabled intentionally; business status, publication state and QR table ownership are checked server-side.

The public order command recalculates item prices, discounts and tax on the server and calls `create_menu_order`; the browser's basket total is display-only.

## Current reliability findings

Important correction to the earlier repository-only audit: the recovered production `src/app.js` already has a `bootPromise` guard, an auth-state listener that does not re-run `boot()` on token refresh, a 30-second Manager context cache keyed by user and business, and a navigation epoch guard. The earlier claims of duplicate boot and unconditional Manager refetch on every navigation described the older GitHub implementation, not the deployed production source. Those were not changed unnecessarily.

1. The production Vercel source was not represented in the GitHub repository at the paths used by the deployment. The exact deployed frontend and its imported helper modules have now been recovered under `src/` on this branch.
2. The live Supabase project has seven active Edge Functions; the previous repository source only tracked three. All seven active function sources have now been copied into `supabase/functions/` on this branch.
3. The live database reports 23 applied migrations: 21 historical versions plus two new recovery migrations. The repository had only two differently named/timestamped historical SQL files, so the original 21 migration scripts remain unrecovered. See `supabase/REMOTE_MIGRATION_HISTORY.md`.
4. The live RLS policies originally allowed business managers to insert, update and delete `business_modules`. This was corrected by applied migrations `20261114082139` and `20261114082546`: insert/update/delete are now Super Admin-only, and `admin_set_business_modules` is a SECURITY INVOKER RPC. A transaction-only role simulation confirmed a Manager claim is denied and an Admin claim succeeds; both calls were rolled back.
5. Super Admin's previous module-save handler deleted every entitlement before re-inserting the selection. A failed insert could leave the business with no modules. The recovery branch now calls the transactional RPC; the database function is live.
6. The Order Taker/Bill Counter workspace previously fetched every historical `order_items` row on each refresh. The recovery branch now limits the query to the 150 displayed orders.
7. Manager overview previously scanned order items across all dates. The recovery branch now scopes that query to the selected activity date.
8. Customer order-status tracking previously polled every second. The recovery branch changes the interval to ten seconds.
9. QR rendering previously imported `qrcode` from `esm.sh` at runtime. The recovery branch now vendors the MIT-licensed library at `src/vendor/qrcode.min.js`, includes its license, and loads the local asset on demand through Vite's `?url` import.
10. Supabase Performance Advisor no longer reports the three missing foreign-key indexes after the migrations. It now reports 13 indexes as unused; none were deleted because a short observation window is not enough to prove they are unnecessary. Security Advisor no longer reports an exposed SECURITY DEFINER RPC. Remaining findings are leaked-password protection disabled and the reset-request table's intentionally policy-free RLS (service-role-only access).
11. Automated tests now target the recovered production `src/app.js` and production helper modules. GitHub Actions reports 178/178 tests passing on the recovery branch. Browser-based end-to-end role tests remain outstanding.

## Target architecture and staged evolution

Do not rewrite the working UI. Keep the visual layer and move functionality behind stable shared foundations in small releases:

```text
src/
  app/
    bootstrap.js       # one auth/session bootstrap
    router.js          # role-aware routes and navigation state
    state.js           # current user, tenant, modules, cached context
  auth/
    session.js
    role-resolution.js
    permissions.js
  services/
    businesses.js
    modules.js
    catalog.js
    orders.js
    billing.js
    realtime.js
  workspaces/
    super-admin/
    manager/
    order-taker/
    bill-counter/
    customer/
  components/
  styles/
```

The shared foundation must own session resolution, current business context, module entitlements, permission checks, API error normalization, loading states and realtime lifecycle. Workspaces should contain role-specific workflows, not duplicate authentication or tenant resolution.

## Release and safety rules

1. Work on `release/digital-vision-unified`; do not edit production directly.
2. Preserve the current production deployment as rollback.
3. Keep the current visual design unchanged unless a verified usability defect requires a targeted adjustment.
4. Do not reset the database, drop business tables, delete tenant/customer data or fabricate migration history.
5. Validate migrations against a staging/transactional environment before applying them to production.
6. Run the 100-case QA policy plus role-based browser workflows.
7. Deploy a Vercel Preview, verify Super Admin and every business role, then request production promotion separately.

## Automated validation

Run the repository suite with:

```bash
node --test tests/*.test.mjs
```

`tests/production-regression.test.mjs` adds a 100-case role/module/business-lifecycle matrix plus production-source regression checks. These are unit/static checks; they do not replace the required browser-based end-to-end scenarios in `QA_POLICY.md`.
