# Digital Vision — Target System Architecture

## 1. Product and system context

Digital Vision is a multi-tenant SaaS platform for businesses that need catalogues, digital customer experiences and operational workflows. The same foundation must support restaurants, retail, jewellery, salons and service businesses.

The core model is:

```text
Platform
  ├── Platform administration
  └── Business tenant
       ├── Members and roles
       ├── Module entitlements
       ├── Catalog (products, services, categories)
       ├── Digital experiences (menu, catalogue, QR landing pages)
       ├── Customers and inquiries
       ├── Tables / QR (where applicable)
       ├── Orders and order items
       ├── Billing / payment records
       ├── Reports and automation
       └── Audit events
```

A Restaurant is a business type, not a separate tenant architecture. Restaurant-specific settings and table workflows remain optional capabilities.

## 2. System topology and ownership

```text
Browser / PWA
  └── Vercel: static SPA delivery, preview deployments, production domain
       └── Digital Vision application
            ├── Bootstrap and session lifecycle
            ├── URL router and route guards
            ├── Persistent application / portal shells
            ├── Feature screens
            ├── Domain services and repositories
            └── Supabase client adapter
                 └── Supabase
                      ├── Auth
                      ├── PostgreSQL + RLS + constraints + indexes
                      ├── Edge Functions (privileged / public commands)
                      ├── Storage (tenant-scoped objects)
                      └── Realtime (tenant-scoped events)

Cloudflare
  └── Existing atelier-og-digital-menu Worker: legacy/optional integration
      Keep out of the critical path unless an active route, DNS record,
      frontend reference or production request proves it is required.
```

### Responsibility boundaries

| Component | Owns | Must not own |
|---|---|---|
| Vercel | Frontend build, immutable previews, static asset delivery and domain aliases | Business rules or database authorization |
| Browser app | Rendering, route state, form interaction and optimistic presentation | Privileged secrets or authoritative price/permission decisions |
| Supabase Auth | Identity and session lifecycle | Business module UI |
| PostgreSQL | Durable records, tenant integrity, RLS and atomic data rules | DOM or navigation |
| Edge Functions | Privileged commands, public commands, orchestration and server validation | General-purpose frontend rendering |
| Repositories | Query/mutation contracts for one domain | DOM access or route decisions |
| Features/portals | User workflows and screen composition | Direct cross-domain SQL or duplicated authorization rules |
| Realtime service | Channel lifecycle and tenant-scoped event delivery | Unbounded polling or cross-tenant subscriptions |

Cloudflare must not proxy the same application/API path as Vercel without an explicit ADR describing the reason, routing owner, caching rules and failure behaviour.

## 3. Frontend architecture

Use a **feature-oriented modular monolith** with one Vite application and one browser runtime. Continue with native ES modules and JavaScript during the first migration slices. Do not combine the reliability migration with an unrequested React/Next.js rewrite or wholesale TypeScript conversion.

### Target source layout

This is the destination structure. Files move only as their owning slice is migrated and tested; do not create empty folders or move files just to satisfy a diagram.

```text
src/
  app/
    bootstrap.js             # single startup and auth hand-off
    router.js                # URL parsing, navigation and route guards
    route-registry.js        # role + path -> feature entry
    application-state.js     # session and active business references
  auth/
    auth-client.js           # one Supabase client adapter
    session-service.js       # get / refresh / sign-out lifecycle
    role-resolver.js         # platform and business role resolution
    permission-policy.js     # shared action policy
  tenancy/
    tenant-context.js        # active business and membership context
    tenant-guard.js          # business context requirements
  infrastructure/
    supabase/
      client.js
      error-mapper.js
    observability/
      logger.js
      performance.js
  domains/
    businesses/
    members/
    entitlements/
    catalog/
    experiences/
    tables/
    customers/
    orders/
    billing/
    inquiries/
    reports/
    realtime/
    audit/
  features/
    super-admin/
    manager/
    order-taker/
    bill-counter/
    customer-menu/
  shared/
    components/
    errors/
    loading/
    utilities/
  styles/
  vendor/
supabase/
  migrations/
  functions/
tests/
  unit/
  integration/
  e2e/
docs/
  architecture/
  engineering/
```

### Layer rules

- **App layer:** boot once, resolve session, choose a route and mount the persistent shell. It coordinates; it does not contain feature SQL or large HTML templates.
- **Auth/tenancy:** resolve identity, role, membership and active business once per relevant session/business change.
- **Domain layer:** owns business concepts and contracts. It must not import DOM APIs or feature screen modules.
- **Infrastructure:** owns Supabase client setup, logging, request/error normalization and external SDK adapters.
- **Repositories:** own database reads/writes and map database records into domain-facing results. Every tenant repository requires an explicit `businessId`.
- **Features:** compose domain operations into role-specific workflows. They own screen state, local loading/error/empty states and retry actions.
- **Shared UI:** presentation-only components that do not query Supabase.
- **Edge Functions/RPCs:** own privileged or atomic commands and repeat all security-critical validation server-side.

A feature must not import another feature's internal implementation. Cross-feature reuse belongs in a domain service or shared component.

## 4. Portals and route ownership

One application runtime supports these portals:

| Portal | Route namespace | Main responsibility |
|---|---|---|
| Super Admin | `/admin/*` | Platform-level business, member and module administration |
| Manager | `/manager/:businessId/*` | Business operations, catalogue, experiences, QR, orders, team and reporting |
| Order Taker | `/staff/:businessId/orders` | Order entry and order workflow |
| Bill Counter | `/staff/:businessId/billing` | Bill preparation and payment workflow |
| Customer/Public | `/menu/:businessSlug/*` | Published menu/catalogue, QR entry and customer ordering |

The route registry is the only mapping between roles, route patterns and feature entry points. A portal does not create its own Supabase client, session listener or global router.

## 5. Navigation, rendering and asynchronous work

These rules directly address the Manager reversion and blank/loading behaviour.

1. Mount the authenticated shell once. Route changes never replace the application root.
2. Update the URL and active navigation immediately; do not wait for section data.
3. Render the selected section frame immediately. Fetch its data inside that feature.
4. Keep loading indicators local to the data region. A loading state must end in success, empty, or actionable error.
5. A failed section remains selected and shows an inline error with Retry. Never silently restore the previous route or redirect to a generic workspace.
6. Every navigation receives a monotonically increasing request identity. A response from an older route cannot render over the current route.
7. Use AbortController where the Supabase/API operation supports cancellation. A timeout alone does not cancel the underlying request.
8. Tenant context is fetched once and cached by both `userId` and `businessId`; invalidate on sign-out, business switch, membership/role change or expiry.
9. Each query key, cache entry and realtime channel includes `businessId`.
10. A global error boundary is reserved for unrecoverable application/bootstrap errors. Feature/data failures never replace the global shell.

### Section state contract

Every feature data region implements the same explicit state model:

- `idle` — not requested yet
- `loading` — request in progress
- `success` — data available
- `empty` — request succeeded with no records
- `error` — request failed; preserve route and expose Retry

No feature may leave an infinite spinner or a blank panel without status and recovery action.

## 6. Authentication and authorization

Authorization is layered:

1. **Route guard:** prevents confusing navigation and presents a clear denial state.
2. **Domain/Edge Function:** validates actor, business, membership status, role, module entitlement and requested action.
3. **PostgreSQL:** RLS, constraints, grants and transaction boundaries are the final enforcement layer.

Never trust browser state, URL parameters, user-editable metadata or hidden buttons as authorization. Authorization claims must use trusted server-managed metadata or database membership records, not user-editable `user_metadata`.

A permission policy uses action-oriented checks (for example, `can(user, "orders.accept", businessContext)`) rather than scattering role-string comparisons across templates.

## 7. Data and tenant model

- `businesses` is the tenant root.
- `business_members` associates authenticated users with a business and role.
- `modules` is the platform capability catalogue.
- `business_modules` stores each business's module entitlements.
- Tenant-owned records carry `business_id`.
- Composite foreign keys should prevent cross-business references where relationships span tenant-owned tables.
- All exposed tenant tables require RLS policies aligned to actual actions.
- Public menu/order access is narrowly scoped to published business/experience and valid QR/table tokens.
- Client-side prices and totals are display-only. The server recalculates authoritative prices, discounts, tax and totals.
- Historical database migrations must remain immutable and accurately represented. Never invent or relabel an already-applied migration.

## 8. Backend command and query strategy

Use direct Supabase reads only where the authenticated role's RLS policy is clear and the query is bounded. Use Edge Functions or atomic database RPCs for privileged or multi-row commands, including staff provisioning, business lifecycle changes, public order submission and payment/status transitions.

Avoid introducing another API server or microservices without measured need. Keep one system of record and one authoritative implementation of each business rule.

## 9. State, caching and realtime

| State | Owner | Invalidation |
|---|---|---|
| Auth session | Auth/session service | Sign-out, expiry, revocation |
| Platform role | Role resolver | Session refresh or role change |
| Active business + membership | Tenant context | Business switch, membership change, expiry |
| Module entitlements | Entitlement domain | Admin change, membership/business change |
| Section data | Domain query/repository layer | Mutation, realtime event, explicit refresh |
| UI-only state | Feature screen | Route exit or user action |
| Realtime channel | Realtime service | Feature exit, business switch, sign-out |

Use bounded queries and pagination for orders, customers and catalogues. Realtime events invalidate only the affected business/query. Do not replace realtime with aggressive polling.

## 10. Observability and support diagnostics

Each request should record a correlation ID, portal, route, feature, operation, business ID, duration, result category and Supabase error code. Do not log passwords, access tokens, service-role keys or unnecessary customer PII.

The diagnostics view should expose:
- app build/version and Git SHA,
- deployment environment,
- authenticated role and active business ID,
- current route,
- last failed operation, error code and duration,
- network/connectivity state.

A successful Auth session must never be labelled as proof that every business query or feature is connected.

## 11. Quality gates

Every change must pass:
- syntax/build checks,
- unit tests for pure domain and routing logic,
- repository/Edge Function contract tests where relevant,
- Playwright browser tests for user-visible flows,
- mobile viewport checks,
- tenant-isolation and role/entitlement tests.

Release-blocking Manager tests include login, immediate shell mount, every navigation item, refresh/deep link, back/forward, rapid navigation, section API failure, retry, business switch, sign-out and expired session. Tests must identify the exact Git SHA and deployment URL. Mocked tests are necessary but do not replace live acceptance against a safe test business.

## 12. Deployment topology

- GitHub is the canonical source and change history.
- Vercel builds immutable previews from branches/PRs and serves the production frontend.
- Supabase remains the live data/auth platform; database and Edge Function changes are versioned in the same repository and promoted deliberately.
- Cloudflare remains outside the request path unless an active Worker route or DNS dependency is proven and documented.

Production must only receive a commit that passed CI and role-by-role preview acceptance. A preview being READY means only that Vercel completed the deployment; it is not a product acceptance result.
