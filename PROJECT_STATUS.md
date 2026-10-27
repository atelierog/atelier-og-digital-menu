# Digital Vision by Atelier OG — Checkpoint

## Checkpoint
Saved: 2026-10-27

## Current product direction
The product is named **Digital Vision by Atelier OG** (formerly Atelier OG Digital Menu). Build a complete restaurant ordering MVP first; expand to jewellery, retail, clothing, salons, and other sectors only after the restaurant flow is tested.

### Restaurant MVP roles
- **Super Admin:** creates restaurant, creates/assigns manager, enables/disables customer ordering.
- **Manager:** maintains restaurant profile, dishes/categories/prices/images, publishes menu, manages table QR codes and order taker accounts, selects menu theme.
- **Order Taker:** receives orders, verifies customer order code, updates status, and prints a simple receipt.
- **Customer:** scans table QR, browses menu, adds to cart, enters name, places order when enabled, receives digital receipt/order code; no account required.

### Restaurant MVP flow
Create restaurant → create Manager → configure catalog → publish menu → create table QR codes → customer places order → shared unique code on customer receipt and order-taker board → verify/deliver → printable receipt.

## Deployment and integrations
- Vercel project: `digital-vision-atelier-og` (project ID `prj_oCkDOkIdaA5d1625Vd7SsY42kWV3`), linked to GitHub repository `atelierog/atelier-og-digital-menu` on `main`.
- Initial Vercel deployment: `https://digital-vision-atelier-ob4wt2m3p-atelier-og.vercel.app` (deployment reported `READY`).
- Custom domain added to Vercel: `digitalvision.atelierog.co.in`. Vercel confirms domain ownership, but its domain configuration check reports the subdomain DNS is misconfigured. In the DNS provider for `atelierog.co.in` (nameservers are Cloudflare), add a CNAME record with host `digitalvision` and target `d51eeb5d1a57eb10.vercel-dns-017.com.`; then verify the domain again.
- Frontend uses Supabase project `qwyquvufneolyesfiipf` URL and browser-safe publishable key in `app.js`. Supabase status is now `ACTIVE_HEALTHY`; public tables and migration history are readable again. Authentication redirects and business workflows still require end-to-end testing.

## Current repository
Repository: `atelierog/atelier-og-digital-menu`
Branch: `main`

### Existing foundation
- Super Admin login/session handling
- Business creation/list/detail
- Member invitation via `admin-manage-member`
- Module entitlements
- Business workspace
- Catalog category and item create/edit/archive UI
- Responsive dark premium UI
- Supabase RLS and cross-business integrity foundation
- Nine modules seeded

### Work started on 2026-10-27
- Added `DIGITAL_VISION_RESTAURANT_MVP.md` defining scope, roles, order lifecycle, build sequence and definition of done.
- Added `supabase/migrations/20261027_restaurant_ordering_foundation.sql` as a **migration draft only**. It proposes restaurant settings, table QR records, and order code/table/source fields.
- The migration has **not** been applied or validated against the live database. Supabase project inspection returned a temporary "Database is possibly not accessible" error. Do not apply the draft until connectivity is restored and the current schema/helper/trigger names are checked.

## Known remaining work
1. Verify live Supabase schema and migration history.
2. Validate/refine the restaurant schema migration; apply it through a reviewed migration workflow.
3. Finish Manager account creation and role model for exactly Super Admin, Manager, Order Taker, Customer (current foundation uses owner/manager/staff membership roles and needs careful mapping).
4. Build manager restaurant settings, menu publishing, photo upload and theme selection.
5. Build table management and printable QR codes.
6. Build public customer menu, cart, customer name, safe order submission and digital receipt.
7. Build Order Taker live order board, code verification, order status updates and printable receipt.
8. Test tenant isolation, ordering toggle, price snapshots, duplicate submissions, mobile UX and full end-to-end flow.
9. Verify production deployment only after tests pass.

## Security constraints
- Do not allow customers to write orders directly using the browser anon/publishable key.
- Public order submission must go through a validated server-side Edge Function that checks menu publication, ordering enabled, QR/table validity, active catalog items and server-side prices.
- Store item name and price snapshots on each order item.
- Keep tenant-owned records isolated by business_id.
- Never expose privileged Supabase keys in frontend code.
- Existing known Supabase security warning: leaked-password protection disabled; resolve before production launch.

## Deployment limitation
The latest Vercel deployment is `READY`, and the stable `vercel.app` URL returned HTTP 200. The custom domain's DNS still needs a CNAME update in Cloudflare before the custom URL is confirmed live. The app has not yet passed a browser end-to-end test; do not claim the restaurant ordering flow is production-ready.

## Resume instruction
Continue Digital Vision restaurant MVP from this checkpoint. Preserve the existing Business OS foundation. Do not restore the old restaurant-only implementation. Do not claim database changes or live tests were completed unless actually verified.
