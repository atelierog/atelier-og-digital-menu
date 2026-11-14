# Digital Vision — recovered production architecture

## Scope and source map

This document describes the production application recovered from the current Vercel deployment and the live Supabase project. It is not a proposed visual redesign. The current website styling is preserved.

- Production domain: `https://digitalvision.atelierog.co.in`
- Vercel project: `digital-vision-atelier-og`
- Supabase project: `qwyquvufneolyesfiipf`
- Recovery branch: `release/digital-vision-unified`
- Production frontend recovered under `src/`:
  - `src/index.html`
  - `src/app.js`
  - `src/style.css`
  - `src/platinum-theme.css`
  - `src/src/auth/*`
  - `src/src/manager/*`

The older root-level `app.js`, `index.html`, `style.css`, and helper modules are the earlier GitHub implementation. They are not the files recovered from the latest production deployment. Keep the distinction explicit until Vercel is linked to one canonical repository path.

## Runtime architecture

### 1. Authentication and session

1. Supabase Auth authenticates the account.
2. `src/app.js` calls a single `boot()` guarded by `bootPromise`.
3. `load()` resolves the current user, platform role, businesses, module catalogue and member count.
4. The auth-state listener handles sign-out and recovery flow; it does not re-run the whole boot on token refresh.
5. Sign-in forms call `boot()` after successful authentication.
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

1. The production Vercel source was not represented in the GitHub repository at the paths used by the deployment. The exact deployed frontend and its imported helper modules have now been recovered under `src/` on this branch.
2. The live Supabase project has seven active Edge Functions; the previous repository source only tracked three. All seven active function sources have now been copied into `supabase/functions/` on this branch.
3. The live database reports 21 applied migrations. The repository had only two differently named/timestamped SQL files, so the exact applied migration history cannot be inferred from those files. See `supabase/REMOTE_MIGRATION_HISTORY.md`.
4. Live RLS policies currently allow business managers to insert, update and delete `business_modules`. Module entitlements should be controlled by Super Admin. A corrective migration and atomic RPC are staged on this branch; they have not been applied to production.
5. Super Admin's existing module-save handler deleted every entitlement before re-inserting the selection. A failed insert could leave the business with no modules. The recovery branch changes this to one transactional RPC.
6. The Order Taker/Bill Counter workspace previously fetched every historical `order_items` row on each refresh. The recovery branch now limits the query to the 150 displayed orders.
7. Manager overview previously scanned order items across all dates. The recovery branch now scopes that query to the selected activity date.
8. Customer order-status tracking previously polled every second. The recovery branch changes the interval to ten seconds.
9. QR rendering still imports `qrcode` from `esm.sh` at runtime. This remains an external dependency and should be locally bundled in a later build-system change.
10. Existing automated tests read the older root-level app, not the recovered production `src/app.js`. Production-path regression coverage is being added.

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
