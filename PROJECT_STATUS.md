# Atelier OG — Business OS Checkpoint

## Checkpoint
Saved: 2026-09-24

## Current state
The project is a fresh rebuild. Legacy restaurant/digital-menu code is not the source of truth.

### GitHub
Repository: `atelierog/atelier-og-digital-menu`
Branch: `main`

Latest application commits include:
- `19077f3` — Build Business OS catalog workspace
- `37e0aab` — Polish catalog workspace UI
- `d097029` — Document current Business OS milestone

### Frontend
- Super Admin login and session handling
- Businesses list/create/detail
- Business member invitation flow
- Per-business module entitlement management
- Business workspace
- Functional Catalog module
  - categories
  - product/service items
  - create/edit
  - archive/activate
  - price, description, image URL
- Responsive mobile UI

### Supabase
Project ref: `qwyquvufneolyesfiipf`

Current public tables:
- businesses
- business_members
- modules
- business_modules
- catalog_categories
- catalog_items
- customers
- orders
- order_items
- inquiries
- audit_logs

All application tables have RLS enabled.

Current data is intentionally empty:
- businesses: 0
- business_members: 0
- business_modules: 0
- catalog_categories: 0
- catalog_items: 0
- customers: 0
- orders: 0
- order_items: 0
- inquiries: 0
- audit_logs: 0

Modules seeded: 9.

### Security/integrity
- Super Admin and business-manager access boundaries hardened.
- Management policies split by operation.
- Cross-business composite foreign keys added for catalog/customer/order relationships.
- Timestamp triggers added for mutable business data.
- Price/order total non-negative constraints added.
- Integrity smoke test passed and rolled back all test data.
- Edge Function `admin-manage-member` is ACTIVE with JWT verification.
- Security advisor currently has one remaining warning: leaked-password protection is disabled.
- Performance advisor findings are informational unused-index notices because the database has no production workload yet.

## Next build order
1. Customers
2. Orders
3. Inquiries
4. Digital Page
5. QR
6. Remaining modules/analytics/automation
7. Production deployment and live end-to-end testing

## Important limitation
Live Cloudflare Worker/browser end-to-end verification has not been performed from this environment. Do not assume the latest GitHub build is live until deployment is explicitly verified.

## Resume instruction
Continue from this checkpoint. Do not restore or reuse the old restaurant-only implementation.
