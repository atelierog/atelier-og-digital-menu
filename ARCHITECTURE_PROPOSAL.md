# Digital Vision — Target Architecture Proposal

**Status:** Proposed baseline for the recovery branch  
**Scope:** Super Admin, Manager, Order Taker, Bill Counter and Customer/Public Menu  
**Decision:** Evolve the recovered application into a modular monolith. Do not replace the database or rewrite every workflow in one release.

## 1. Executive decision

The current product has sound infrastructure choices for its present scale: Vite, Supabase Auth/Postgres/RLS/Storage/Edge Functions and Vercel. The main architectural weakness is the frontend boundary. The recovered frontend is a large imperative module (src/app.js, approximately 123 KB) that owns authentication, workspace selection, tenant context, navigation, data access, markup generation, event binding and workflow actions together.

The target is a feature-oriented SPA with one shared application shell and explicit domain/service boundaries. Keep Supabase as the system of record and Vercel as the frontend host. Migrate incrementally behind the existing UI and database contracts.

This is not a recommendation to introduce microservices. Digital Vision is one product with shared tenant, identity, catalog and order domains. A modular monolith is easier to test, deploy, observe and maintain than independently deployed services at this stage.

## 2. What code inspection establishes

The recovery branch contains:
- One large src/app.js that includes Super Admin, Manager, staff and customer/public workflows.
- A Manager route table and Manager context cache, but navigation, data loading, access checks and DOM replacement remain coupled.
- Direct Supabase queries from UI/workflow functions rather than a consistent service/repository boundary.
- HTML string rendering and repeated manual event binding.
- navigateManager() sets the route status to “Loading …”, calls managerView(), and on a rejected promise restores the previous view. This is an explicit rollback path.
- managerView() waits for section data before replacing the Manager shell. Sections with multiple queries can leave the previous page displayed while the header says it is loading.
- The shared error() helper replaces the entire #app root with a generic full-page error. Feature loaders call it, so a local feature failure can destroy the Manager shell.
- Initial Manager entry reopens savedManagerView() from session storage. A stale saved route/context can complicate first entry.
- The source checked in this branch does not contain the exact user-visible phrase “Opening Tables & QR…”. It contains “Loading [section]…”. The exact screenshot string is not explained by this source snapshot alone; deployed asset/cache/source revision must be matched before claiming the screenshot is fixed.

These are code-level findings, not proof of a specific Supabase/RLS failure. The exact failing request still needs runtime telemetry: operation, status, PostgREST error code and duration.

## 3. Target system architecture

### 3.1 High-level topology

    Browser / PWA
      Application bootstrap
        Auth session
        Platform role
        Tenant membership
        Active business context
      Application router
        /admin/*
        /manager/:businessId/*
        /staff/:businessId/orders
        /staff/:businessId/billing
        /menu/:businessSlug
      Shared UI shell + feature screens
        Super Admin
        Manager
        Order Taker
        Bill Counter
        Customer/Public
      Domain services (typed contracts, no DOM access)
        identity / access
        businesses / tenant
        modules / entitlements
        catalog / menu
        tables / QR
        orders / order items
        billing / payments
        customers
        reporting
        staff / team
        realtime

    Supabase
      Auth
      PostgreSQL + RLS + constraints + indexes
      Storage (tenant-scoped uploads; published assets only)
      Edge Functions (privileged commands and public order commands)

    Vercel
      Static frontend assets / SPA fallback
      Immutable Preview deployments for branch acceptance

### 3.2 Frontend structure

Adopt TypeScript for new modules and migrate existing JavaScript in slices. Do not convert the entire codebase in one risky commit.

    src/
      app/
        bootstrap.ts             # one auth/session bootstrap
        router.ts                # route parsing, guards, navigation
        route-registry.ts        # route -> screen mapping
        app-state.ts             # session + active tenant state
        query-client.ts          # server-state cache defaults
      auth/
        auth-client.ts
        session-service.ts
        role-resolver.ts
        permission-policy.ts
      tenants/
        tenant-context.ts
        tenant-guard.ts
      shared/
        components/
          AppShell/
          PageHeader/
          InlineError/
          SectionSkeleton/
          EmptyState/
          Toast/
        errors/
          app-error.ts
          normalize-error.ts
        observability/
          logger.ts
          performance.ts
        utils/
      domains/
        businesses/
        modules/
        catalog/
        digital-menu/
        tables/
        orders/
        billing/
        customers/
        staff/
        reports/
        realtime/
      features/
        super-admin/
          routes/
          screens/
          components/
        manager/
          routes/
          screens/
          components/
        order-taker/
        bill-counter/
        customer-menu/
      styles/
      vendor/

**Framework decision:** keep Vite. Introduce React + TypeScript + React Router + TanStack Query only as a controlled migration if the team accepts the dependency and migration cost. Do not mix a framework conversion with the immediate Manager reliability fix. The architectural contracts below are mandatory regardless of whether the UI is React or a progressively modularized vanilla SPA.

## 4. Navigation and loading rules — non-negotiable

The Manager issue is first in the implementation order.

1. The application shell is persistent. A route change must never replace the root #app or authenticated shell.
2. No route rollback. If a section fails, remain on that section and render an inline error with Retry. Never silently restore the previous route or send the user to a generic workspace.
3. No blocking route spinner. Navigation changes the selected route immediately. Render the page frame immediately; load its data into the page. Use small skeletons only inside the data region that is waiting.
4. No indefinite loading state. Every request has timeout/abort policy, visible error state and retry path. A loading indicator must resolve to success, empty or error.
5. Preserve the active business. Route changes must not re-run business discovery or re-resolve tenant membership unless the tenant changes or membership cache is invalidated.
6. No automatic home redirect on transient failure. Only explicit sign-out, revoked session or denied route may redirect, with a clear reason.
7. Deep links are first-class. The URL identifies the active workspace and section. Refreshing a Manager QR route must reopen that route after authorization.
8. Race-safe navigation. A request started for an older route cannot overwrite a newer route. Use AbortController/request identity and ignore stale responses.
9. Section isolation. A failed QR query cannot destroy Orders, the Manager shell or auth session.
10. No misleading “Connected” status. Show connectivity separately from section load state. A successful auth session does not mean every domain request succeeded.

### Route transition contract

    User selects Manager > Tables & QR
      URL/state changes to /manager/{businessId}/qr immediately
      Persistent Manager shell remains mounted
      QR screen frame renders immediately
      QR service loads only QR data
        success -> render table list
        empty -> render empty state
        failure -> render inline error + Retry
      User stays on /manager/{businessId}/qr in every case

## 5. State ownership and cache policy

| State | Owner | Lifetime |
|---|---|---|
| Auth session and platform role | Auth/session service | Until sign-out/session expiry |
| Active business and membership | Tenant context | Until business switch, membership change or explicit invalidation |
| Server data (orders, tables, catalog, settings) | Query cache/domain services | Per query key with stale time and invalidation |
| UI-only state (modal, filters, selected tab) | Feature screen | Screen/session |
| Realtime channel | Realtime service | While relevant tenant screen/session is active |

All tenant query keys must include businessId. Example: ['manager','tables',businessId]. Never cache tenant data under a global key. On business switch/sign-out, clear tenant-scoped cached data and close realtime channels.

Suggested initial cache defaults:
- Membership/tenant context: 60–120 seconds, explicit invalidation on role/business changes.
- Catalog/settings/tables: 30–60 seconds, invalidate after writes.
- Orders: 5–10 seconds plus realtime invalidation; do not poll every second.
- Reports: 30–60 seconds and date-range keyed.
- Public menu: short cache only when publication/version rules allow it.

## 6. Authorization and tenant isolation

Authorization is enforced in three layers:

1. Route guard: prevents accidental UI access and provides a useful denial screen.
2. Domain service / Edge Function: validates actor, business, role, enabled module and requested action.
3. Postgres RLS + constraints: final enforcement for every tenant-owned row.

A hidden button is not security. A route guard is not security. Every tenant-owned table must be reviewed for RLS and tenant scoping. Every service method must require a business context for tenant-owned reads/writes. Privileged operations stay in Edge Functions or narrowly scoped database RPCs.

Permission policy should be centralized as explicit action checks, e.g. can(user, 'orders.accept', businessContext), not duplicated role-string checks in screen components.

## 7. Backend boundaries

Keep Supabase Postgres as the transactional system of record.
- Direct client reads: only for data whose RLS policy is clear and safe for the authenticated role.
- Edge Function commands: staff provisioning, privileged business lifecycle changes, payment/status transitions, public order submission and other multi-step or privileged operations.
- Database functions: atomic multi-row transactions where the database is the correct transaction boundary.
- Realtime: publish minimum tenant-scoped events; subscribe/unsubscribe through one lifecycle owner.
- Storage: uploads use authenticated, tenant-scoped paths and policies. Public access is limited to intentionally published assets.

Do not introduce a separate API server or microservices without measured need. Avoid duplicating business rules between browser and Edge Functions; server-side validation is authoritative.

## 8. Domain contracts

| Domain | Owns | Must not own |
|---|---|---|
| Identity | Session, user identity, platform role | Business-specific module UI |
| Tenant | Active business, membership, status | Catalog/order data |
| Entitlements | Enabled module codes and action policy | UI navigation implementation |
| Catalog | Categories, items, prices, media references | Order payment transitions |
| Tables/QR | Table lifecycle, QR token, public menu target | Customer authentication |
| Orders | Order creation, snapshots, status lifecycle | Receipt presentation |
| Billing | Payment records, receipt calculation/printing | Catalog editing |
| Staff | Order Taker/Bill Counter accounts and permissions | Platform admin controls |
| Reports | Aggregated read models and export | Mutating orders |

The public customer order endpoint must continue recalculating prices, discounts and taxes server-side. Client basket totals remain presentation-only.

## 9. Reliability, observability and performance

Every domain request should log:
- request/correlation ID,
- route and feature name,
- operation name,
- business ID (never secrets or customer PII in general logs),
- duration,
- Supabase/PostgREST error code,
- normalized error category.

Capture route-level metrics: time to interactive shell, section data duration, failed request count and retry count. Add an admin diagnostics panel that reports deployment commit, app version, session role, active business ID and last failed request code.

Performance targets for mobile:
- Authenticated shell appears without waiting for all dashboard queries.
- Route frame changes immediately on click.
- No global page blanking during section data fetch.
- Avoid N+1 query patterns and unbounded history reads.
- Use pagination for orders, customers and catalog at scale.
- Realtime updates invalidate only affected tenant queries.

## 10. Testing strategy

### Unit and contract tests
- Route parsing and deep-link restoration.
- Role/module/action permission matrix.
- Tenant query-key isolation.
- Error normalization and retry rules.
- Order lifecycle and billing calculations.
- Realtime channel cleanup.

### Browser E2E (Playwright)
For each role, test login, initial route, every navigation item, refresh on each deep link, browser back/forward, mobile viewport, expired session, network interruption, denied permission and retry.

**Manager acceptance cases (release blocker):**
1. Login opens Manager directly without a second workspace-selection screen.
2. Manager shell mounts once and remains mounted while changing sections.
3. Overview -> Menu -> Tables & QR -> Orders -> More -> Overview.
4. Each route remains selected if its data request fails.
5. No full-page “Loading workspace” or route-level “Opening…” screen after initial auth.
6. Refresh on Tables & QR remains on Tables & QR.
7. Rapidly tapping two sections cannot let an older request overwrite the newer one.
8. Switching business/signing out clears prior tenant data.
9. Network offline/online recovery produces inline error/retry, not a workspace reset.

### CI gates
- Type check.
- Lint/format.
- Unit/contract tests.
- Production build.
- Playwright smoke suite against Preview.
- No production promotion unless all release-blocking E2E tests pass.

The current 179 unit/static tests are useful but do not satisfy the browser E2E gate.

## 11. Phased implementation plan

### Phase 0 — Establish source/deployment truth
- Record exact Vercel deployment ID, commit SHA and served asset hashes for every preview test.
- Compare the live browser bundle with the branch build.
- Check service-worker/PWA cache behaviour and stale browser assets.
- Add a visible build/version stamp to the app and diagnostics.
- Do not alter production.

### Phase 1 — Stabilize Manager navigation (first delivery)
- Remove route rollback and global-root error replacement from Manager feature loaders.
- Add persistent shell/route frame and section-level error states.
- Make route state/URL authoritative and restore the selected route safely.
- Remove the generic “Loading/Opening [section]” banner; show only local data skeletons when necessary.
- Add explicit timeouts, request cancellation and stale-response protection.
- Add Manager Playwright tests before touching other portals.

### Phase 2 — Extract shared foundations
- Move auth/session, role resolution, tenant context, entitlements, router and error handling out of src/app.js.
- Introduce domain service/repository boundaries.
- Add centralized query/cache and realtime lifecycle.
- Keep the existing UI and Supabase schema.

### Phase 3 — Migrate feature by feature
1. Manager: Overview, Catalog, Digital Menu, Tables/QR, Orders, Reports, Team, More.
2. Order Taker.
3. Bill Counter.
4. Super Admin.
5. Customer/Public Menu.

Each feature is migrated and tested independently; no big-bang rewrite.

### Phase 4 — Data and backend hardening
- Audit every tenant-owned table, RLS policy, foreign key and index.
- Reconcile historical migration source files with the live migration ledger; never fabricate missing history.
- Add contract tests for Edge Functions and database RPCs.
- Review public endpoints, storage policies and rate limits.

### Phase 5 — Release
- Preview deployment with immutable commit/version.
- Full role-based browser acceptance on desktop and mobile.
- Promote only the accepted commit.
- Preserve the current production deployment as rollback.

## 12. Decisions and constraints

- Preserve existing business/customer/order data.
- Preserve current product capabilities and visual identity unless a tested usability change is required.
- No database reset, destructive schema rewrite or unreviewed production migration.
- No production deploy during architecture migration.
- No “fixed” claim based only on a green build or unit tests.
- Every release must identify the exact source commit and preview URL.

## 13. Immediate next engineering task

Before broad refactoring, reproduce the Manager failure on a preview whose deployed SHA is confirmed to match the source branch. Add request-level diagnostics around Manager route loaders and verify whether the failure is:
- stale deployed JavaScript/PWA cache,
- membership/entitlement query error,
- missing table/schema or RLS denial,
- a feature loader throwing/replacing the root,
- a race between overlapping navigation requests.

Then implement Phase 1 with browser tests. The exact “Opening …” text shown in the supplied screenshots must be located in the served asset or service-worker cache before it is considered removed.
