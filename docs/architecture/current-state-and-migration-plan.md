# Digital Vision — Current State and Migration Plan

**Baseline date:** 14 November 2026  
**Audited source branch:** `release/digital-vision-unified`  
**Audited branch head:** `1593c41467d1d5e43723432c4521a3b537fd1a77`  
**Last release-branch deployment inspected:** `4703960f08bb77fbd294d9dc0a8117470b05ba61`

## 1. Verified current state

### Source control

- Repository: `atelierog/atelier-og-digital-menu`.
- `main` still points to the October 27 recovery baseline.
- `release/digital-vision-unified` is the active November integration branch.
- The release branch is 242 commits ahead of `main` and 0 behind it at the comparison snapshot.
- The release branch moved 11 commits beyond the Vercel deployment inspected during this audit. Therefore a READY Vercel deployment can still be behind the latest source.
- The Manager onboarding branch is historical context, not the current source of truth.

The October-only history seen in the first audit was caused by inspecting `main` and the old onboarding branch rather than the release branch.

### Frontend

- Vite SPA with root `index.html`, `package.json`, `vite.config.js` and `vercel.json`.
- Canonical runtime entry on the release branch is `src/app.js`; the previous root `app.js` was removed from that branch.
- The app remains a large central coordinator (approximately 106 KB at the inspected release snapshot).
- Some boundaries have been extracted: `src/core/`, `src/features/`, `src/domains/`, `src/manager/` and `src/auth/`.
- The Manager shell, tenant context cache, navigation epoch, manager workspace loader and portal routing have extracted modules.
- Several portal and feature workflows still live in the central app coordinator. This is a transitional modular monolith, not yet the final feature/domain separation.

### Manager reliability — confirmed production cause

The production custom domain was fetched directly from Vercel during this audit.

- Production `index.html` serves `./app.js?v=20261113d`, root-level `./style.css` and `./platinum-theme.css`.
- The release branch `index.html` instead serves `./src/app.js?v=20261114d`, `./src/style.css` and `./src/platinum-theme.css`.
- The production deployment currently assigned to `digitalvision.atelierog.co.in` is `dpl_HmoiyUhpLe5GVsoT6xTTa2HqsSVV`. Its Vercel deployment metadata has no Git commit SHA or branch.
- The production-served root `app.js` contains the exact rollback path seen in the user's screenshot: `navigateManager()` stores `previousView`, displays `Opening [section]…`, and on a rejected navigation restores `app.dataset.managerView=previousView`.
- That same production source can call `workspace()` when Manager membership is not resolved and replaces the whole `#app` root for some entitlement failures.
- The current release-branch `src/app.js` has no `previousView` restore in `navigateManager()`. It updates the selected section, uses the existing Manager shell, and catches feature errors inside `.manager-content`.

This establishes a source/deployment mismatch, not merely a speculative browser-cache issue. The user was testing the production domain while the rollback removal existed on a separate release-branch build. Do not patch the old production bundle as a second source of truth. Continue from the canonical release branch, verify its preview, then promote the tested build only after acceptance.

Remaining release risks in the current release source:
- The Manager feature dispatcher and many screen/data functions remain in `src/app.js`.
- Section navigation replaces the content region with a skeleton before data resolves. This is acceptable only if the skeleton is visible, bounded and followed by success/empty/error.
- `managerAwait` uses a timeout race. A timeout does not cancel the underlying network request; request cancellation must be added where supported.
- Current Playwright tests use deterministic mocked Supabase responses. They do not prove that live RLS, schema, order/payment transactions or QR printing work.
- The production app's current bundle is not the same source layout as the release branch. A browser/PWA cache may still matter after cutover, but it is not the primary cause of the rollback currently observed.

### Hosting and backend

- Vercel project: `digital-vision-atelier-og`, linked to this repository.
- Production domain configured on that Vercel project: `digitalvision.atelierog.co.in`.
- Production deployment ID: `dpl_HmoiyUhpLe5GVsoT6xTTa2HqsSVV`, READY, but with no Git source metadata.
- The latest inspected release-branch deployment was READY from `release/digital-vision-unified`, commit `4703960f`; the branch had 11 newer commits.
- A fresh Vercel Preview was created for architecture commit `e10b2d7c`, which contains the current release source plus architecture documentation. Its Vercel deployment check succeeded.
- Supabase project: `qwyquvufneolyesfiipf`, PostgreSQL 17, ACTIVE_HEALTHY.
- Supabase has 23 migration records and seven active Edge Functions.
- The live migration ledger contains historical migrations whose original SQL files are not all present in the Git repository. The two November 14 migrations are tracked; missing historical SQL must be recovered, not fabricated.
- Supabase Security Advisor currently reports leaked-password protection disabled and an RLS-enabled `staff_password_reset_requests` table with no policies. The latter may be intentionally inaccessible to browser roles because Edge Functions own the access path; verify callers before changing it.
- Supabase Performance Advisor reported unused indexes. Do not remove indexes solely from an early/low-traffic usage snapshot.
- Supabase Preview branching is disabled for this project; its PR check reports skipped. No database preview was created for the architecture PR.
- Cloudflare account contains an `atelier-og-digital-menu` Worker last modified September 4, with no routes in the Worker listing. Its live dependency status remains unproven. The `digitalvision.atelierog.co.in` DNS record is a non-proxied CNAME to Vercel, so the public app domain is currently served by Vercel, not through the old Worker.

## 2. Migration principles

1. The release branch is the current integration base until a deliberate main-branch cutover.
2. Create short-lived migration branches from the current release head; never develop against stale `main`.
3. One migration slice per PR and commit. Keep every slice buildable and reversible.
4. Preserve existing UI, data and Supabase contracts unless a tested change requires otherwise.
5. No big-bang rewrite, framework migration, database reset or destructive migration.
6. Do not delete old code until the replacement is wired, tested and the old call path is proven unused.
7. Do not call a build or mocked browser test a live production acceptance test.
8. No production deployment during foundation work.

## 3. Phased migration

### Phase 0 — Source and environment control

- [x] Identify the correct November release branch and current branch head.
- [x] Confirm Vercel project and Git repository linkage.
- [x] Confirm the Supabase project, migration count and Edge Function inventory.
- [x] Identify the existing Cloudflare Worker and verify that no Worker route is configured in its listing.
- [x] Inspect the production custom domain and identify its actual served entry point.
- [x] Confirm the production bundle still contains the previous-route rollback and loading banner.
- [x] Confirm the release-branch source has removed that rollback path.
- [x] Create a Vercel Preview from the architecture branch containing the current release source; Vercel deployment check succeeded.
- [ ] Record a Git SHA for production after the eventual controlled cutover; current production deployment has no Git metadata.
- [ ] Recover local/uncommitted November work, if any, before changing application code.
- [ ] Add a build/version diagnostic containing the exact Git SHA.

### Phase 1 — Architecture foundation (PR #8)

- [x] Define modular-monolith decision and system boundaries.
- [x] Define target folder layout and ownership rules.
- [x] Define tenant/auth/navigation invariants.
- [x] Define migration phases and release gates.
- [x] Define branch/commit/preview workflow.
- [x] Confirm CI runs on architecture branches and PRs targeting the release branch.
- [ ] Add/commit a deterministic dependency lockfile before the next runtime code migration.
- [ ] Confirm GitHub Actions succeeds on the final PR head before merge.
- [ ] Supabase database preview remains unavailable because project branching is disabled; this docs-only PR makes no database change.

### Phase 2 — Stabilize runtime contracts

- [ ] Centralize bootstrap, route registry and role resolution.
- [ ] Make route URL/state authoritative and add safe deep-link restoration.
- [ ] Replace timeout-only manager requests with abortable request lifecycles where supported.
- [ ] Ensure feature loaders never replace `#app` or mutate another feature's region.
- [ ] Make every feature use explicit loading/success/empty/error/retry states.
- [ ] Add build SHA and runtime request diagnostics.
- [ ] Add browser tests for rapid route changes, stale requests and offline/retry behaviour.

### Phase 3 — Extract domains and repositories

Migrate one domain at a time:
1. Business/member/entitlement reads and policies.
2. Catalog/categories/items.
3. Digital experience/public menu and QR.
4. Tables and QR lifecycle.
5. Orders/order items and realtime.
6. Billing/payment and receipts.
7. Customers/inquiries.
8. Staff operations.
9. Reports/automation/audit.

Each repository has explicit input/output contracts and requires a business context for tenant-owned operations.

### Phase 4 — Migrate portals

1. Manager feature screens.
2. Order Taker.
3. Bill Counter.
4. Super Admin.
5. Customer/Public Menu.

Do not migrate all portals in one PR. Each portal must pass its role-specific E2E suite before the next portal is cut over.

### Phase 5 — Backend and data integrity

- Reconcile the 23 live migration records with committed migration history.
- Recover the missing historical SQL from the original authoring environment or verified backups.
- Audit RLS, grants, views, SECURITY DEFINER/INVOKER functions, composite foreign keys and storage policies.
- Test all seven active Edge Functions against explicit role and tenant cases.
- Confirm the public ordering transaction recalculates prices/taxes on the server.
- Do not apply a schema change until its migration is committed, reviewed and tested against a safe branch/database.

### Phase 6 — Release acceptance

- Build from the exact candidate SHA.
- Create a Vercel Preview for that SHA.
- Run unit, integration and browser E2E suites.
- Test all five portal roles on desktop and mobile.
- Verify deep links, session restore, sign-out, tenant isolation, QR generation/printing, order lifecycle, billing and realtime.
- Confirm the preview is the exact commit being accepted.
- Promote only after explicit production release approval.
- Preserve the current production deployment as rollback.

## 4. Definition of done

A migration slice is done only when:
- code is in the correct layer and has one clear owner;
- no duplicate/legacy call path remains active;
- no hidden redirect, previous-route rollback or full-root error replacement remains in the affected flow;
- loading resolves to success, empty or actionable error;
- unit/contract/browser tests cover the changed behaviour;
- CI is green on the exact commit;
- Vercel Preview identifies the same SHA;
- documentation and migration status are updated.

A full platform migration is complete only when all portals and core domains satisfy these gates and the live production domain is serving the deliberately promoted release SHA.
