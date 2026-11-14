# Digital Vision architecture migration status
Date: 14 November 2026
Branch: release/digital-vision-unified

## Implemented in this migration slice
- Manager shell is rendered before Manager business, membership, module and entitlement requests complete.
- Manager route changes update the existing .manager-content region rather than replacing the application root.
- A shared navigation epoch controller rejects stale route responses.
- Section failures remain inside the active section with a Retry action; route changes do not restore the previous route. Manager context bootstrap is bounded to 4 seconds and individual section requests to 15 seconds, after which a retryable inline error replaces the skeleton.
- Manager sign-out is available in the sidebar and top bar. It stops the active order watcher and clears the local tenant context before signing out.
- Tenant context cache, navigation request control and role-to-portal routing are extracted into src/core/.
- Manager shell rendering, section skeletons, request timeouts and inline error UI are extracted into src/features/manager/manager-shell.js.
- Manager workspace data access is extracted into src/domains/workspaces/manager-workspace.js.
- Order Taker and Bill Counter screens now live in src/features/staff/staff-workspace.js and share src/domains/staff/staff-desk-repository.js.
- Super Admin overview screen and dashboard data access are extracted into src/features/super-admin/overview-screen.js and dashboard-repository.js.
- Customer/public menu screen lives in src/features/customer/public-menu.js and calls src/domains/customer/public-menu-api.js.
- Role-to-portal selection is centralized in src/core/portal-routing.js.
- Playwright/Chromium browser tests cover Manager shell timing, route persistence, Manager sign-out, Super Admin, staff portals and public menu.

## Verification boundaries
The browser tests use deterministic mocked Supabase responses. They validate browser boot, route transitions and shell persistence; they do not establish that every live database query, RLS policy, order transaction, bill/payment flow, or QR print workflow works against production data.

Do not promote to production until the preview passes live role-by-role acceptance, including Manager, Super Admin, Order Taker, Bill Counter and public customer ordering.

## Next migration slices
1. Extract Manager feature screens and commands into feature modules.
2. Add browser tests for order lifecycle and billing/payment flows.
3. Verify QR generation and printing on mobile and desktop.
4. Expand tenant isolation and permission tests.
5. Reconcile the remaining legacy app module and add build/version diagnostics.
