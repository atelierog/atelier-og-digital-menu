# Digital Vision — Restaurant Ordering MVP

## Goal
Deliver one complete restaurant workflow on the existing Atelier OG Business OS foundation before expanding to jewellery, retail, clothing, salons, or other sectors.

## MVP roles
1. **Super Admin** — creates restaurant tenant, creates/assigns its Manager account, enables/disables customer ordering, and controls access.
2. **Manager** — manages restaurant profile, categories, dishes, prices, descriptions, product photos, publishing, table QR codes, order-taker accounts, and restaurant theme.
3. **Order Taker** — receives live orders, sees table/customer/order details, verifies the unique order code, updates order status, and optionally prints a receipt.
4. **Customer** — scans a QR code, browses the published menu, adds items to cart, enters a name, places an order when ordering is enabled, and receives a digital receipt/code. No customer account required for MVP.

## Restaurant journey
1. Super Admin creates a restaurant and Manager account, then enables the required modules.
2. Manager adds categories and dishes, configures the public menu, and publishes it.
3. Manager creates QR codes for tables (e.g. Table 1–10). Each QR opens the restaurant menu with a validated table identifier.
4. When customer ordering is enabled, a customer can submit an order from the QR menu.
5. The system creates a unique human-readable order code and stores an immutable snapshot of item names, quantities, and prices.
6. Customer receipt and Order Taker order card show the same code, customer name, table, items, quantities, and total.
7. Order Taker verifies the code with the customer and updates the order lifecycle.
8. Optional first-phase print view produces a simple receipt. Full GST/tax invoice and printer integrations are later scope.

## Required order states
NEW → ACCEPTED → PREPARING → READY → DELIVERED
Also allow CANCELLED, with authorized status changes and an audit trail.

## Manager settings
- Ordering enabled/disabled per restaurant by Super Admin.
- Public menu published/unpublished by Manager.
- Table QR management with table labels and printable QR sheets.
- Selectable menu themes/layouts with a clean, premium default.
- Order Taker accounts are available only for restaurant tenants.

## Minimum data additions/review
Reuse the existing businesses, business_members, business_modules, catalog_categories, catalog_items, customers, orders, order_items, and audit_logs tables where suitable.
Review/add secure structures for:
- restaurant/table settings and QR identifiers;
- public menu publishing/theme configuration;
- order source/table reference and unique public order code;
- order status history or audit events;
- image storage policies.
All tenant-owned records must be isolated by business_id. Never expose privileged Supabase keys in browser code. Keep schema changes in versioned migrations.

## Build sequence
1. Confirm existing schema and role/RLS rules before changing data.
2. Complete Super Admin creation of restaurant and Manager login.
3. Complete Manager restaurant setup, catalog image upload, publishing, and table QR creation.
4. Build public QR menu, cart, customer name, order submission, and digital receipt.
5. Build Order Taker live order board, code verification, and status updates.
6. Add printable receipt.
7. Test permissions, cross-tenant isolation, ordering-disabled behavior, duplicate submissions, price snapshots, mobile layouts, and end-to-end flow.
8. Deploy and verify the live site only after tests pass.

## Explicitly out of MVP
- Jewellery/retail/clothing/salon workflows.
- Payment gateway and online payment.
- Full GST/accounting billing and POS hardware integration.
- Customer accounts and loyalty.
- AI recommendations and advanced analytics.

## Definition of done
A test restaurant can be created, managed, published, and used through a real QR scan on a phone. An order placed by a customer appears for the correct restaurant's Order Taker with matching unique code and correct price snapshot; status changes work; a printable receipt works; and another tenant cannot access the restaurant's data.

## Current known starting point
The existing repository has the Business OS shell, Super Admin business management, module entitlements, member invitation, and basic catalog UI. The order/QR/public-menu journey is not yet verified as end-to-end complete. Supabase live inspection recently returned a temporary accessibility error; confirm the live schema before applying database changes.
