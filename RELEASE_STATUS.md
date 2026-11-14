# Digital Vision recovery — implementation status

Updated: 2026-11-14

## Recovery branch

- Branch: `release/digital-vision-unified`
- Base: `codex/manager-onboarding-dashboard`
- Production frontend source recovered from the current Vercel deployment and normalized into the canonical repository root (`index.html`, `package.json`, `vercel.json`, with application code under `src/`).
- Seven active Supabase Edge Functions recovered and compared byte-for-byte with the live function source.
- Current production frontend was not replaced.

## Verified before changes

The recovered production frontend already had a deduplicated `bootPromise`, an auth-state listener that avoids re-booting on token refresh, a 30-second Manager context cache keyed by user/business, and a navigation epoch guard. These were preserved. Earlier audit notes about duplicate boot and every-navigation Manager refetch applied to the older GitHub implementation, not the deployed production source.

## Implemented

### Production frontend on the recovery branch

- Centralized Manager module authorization in `canAccessManagerModule`, used by Manager route checks and navigation.
- Replaced the Super Admin module-save delete-then-insert sequence with the atomic `admin_set_business_modules` RPC.
- Limited Order Taker/Bill Counter `order_items` reads to the 150 displayed orders instead of downloading all historical items on every refresh.
- Scoped Manager overview item analytics to the selected date.
- Reduced customer order-status polling from every 1 second to every 10 seconds.
- Replaced runtime QR CDN loading with a locally vendored MIT-licensed QR library, loaded on demand through Vite.
- Replaced runtime Supabase SDK CDN import with pinned `@supabase/supabase-js@2.119.0`, bundled by Vite `8.3.8`.
- Added Vite production build and CI build verification.

### Production database

Two non-destructive migrations have been applied and verified:

1. `20261114082139_20261114100000_harden_module_entitlements_and_fk_indexes.sql`
   - Manager no longer has direct insert/update/delete rights on `business_modules`.
   - Adds atomic Super Admin module/ordering RPC.
   - Adds the three missing foreign-key indexes reported by Supabase.
2. `20261114082546_make_module_entitlement_rpc_invoker.sql`
   - Changes the RPC to SECURITY INVOKER so it honors caller RLS policies.

Verification:
- `business_modules` still contains 11 rows; no module records were removed by the migrations.
- A transaction-only role simulation confirmed a Manager claim is denied and an Admin claim can call the RPC; both calls were rolled back.
- Supabase Performance Advisor no longer reports the three missing FK indexes.
- Supabase Security Advisor no longer reports an exposed SECURITY DEFINER RPC.

## Automated checks

- GitHub Actions: 179 tests passed, 0 failed on the recovery branch.
- Vite production build succeeded.
- Build output: main JavaScript bundle 334.61 kB (86.04 kB gzip), CSS 55.52 kB (11.87 kB gzip), local QR asset 19.92 kB.
- These tests are unit/static regression tests. Full browser end-to-end tests for all live roles are still required.

## Source-of-truth gaps

- The live database has 23 migration records.
- The original 21 historical migration SQL files were not found in any of the ten checked Git branches. Two old local migration files have mismatched timestamps/names and must not be relabelled as applied migrations.
- All seven active Edge Functions are now present in this branch.
- Vercel production deployments have no Git commit metadata. The current production frontend was manually deployed and was not represented in the repository before this recovery.
- The recovery branch has not been merged into `main`.

## Vercel preview status

A preview was built from the recovered `src/` source before the Vite bundling changes. A new preview for the current Vite build could not be created because Vercel returned HTTP 402: the team reached its limit of more than 100 deployments per day; retry is available after 24 hours. The latest Vercel preview is still from commit `b4e3c016` and serves the pre-normalization root application; it is stale and must not be used for final acceptance. The new canonical-root branch build is verified in GitHub Actions, but it still needs a fresh Vercel preview after the deployment quota resets.

The Vercel project settings were restored to their previous values after preview testing. For the eventual release, use:

- Root directory: repository root (default)
- Install command: `npm install`
- Build command: `npm run build` (from `vercel.json`)
- Output directory: `dist` (from `vercel.json`)
- Node: `24.x`

Production deployment and the production domain were left untouched. The active production deployment remains `dpl_HmoiyUhpLe5GVsoT6xTTa2HqsSVV` (READY); `https://digitalvision.atelierog.co.in` returned HTTP 200 during verification.

## Remaining items

1. Wait for Vercel deployment quota reset (or resolve the team's deployment limit) and create a fresh preview from this branch.
2. Run real browser workflows for Super Admin, Manager, Order Taker, Bill Counter and customer/public menu.
3. Verify refresh, deep links, business switching, permissions, QR print, order lifecycle, billing and realtime.
4. Recover the exact SQL for the 21 historical migrations from the original authoring environment/backups; do not fabricate them.
5. Enable leaked-password protection in Supabase Auth settings. This is an account setting, not a frontend code fix.
6. After preview acceptance, merge the recovery branch to the canonical branch and promote to production deliberately.
