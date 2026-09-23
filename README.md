# Atelier OG — Business OS

A multi-tenant business platform for restaurants, retail, jewellery, clothing, salons, service businesses, and catalog-based brands.

## Foundation
- Super Admin
- Businesses
- Business Members
- Module Entitlements
- Catalog
- Digital Experiences
- Customers
- Orders
- Inquiries
- Automation
- Audit Logs

## Architecture rules
- The tenant is a business, not a restaurant.
- Catalog is the general product/service system; restaurant Menu is an optional experience.
- Module access is enforced server-side/database-side, not only by the UI.
- Every business is isolated from every other business.
- Super Admin controls business creation and module access.
- Old Restaurant/Digital Menu code is not part of the new source of truth.

## Build status
Fresh rebuild from an empty application source.

Current milestone:
- Super Admin business management and member invitation
- Per-business module entitlements
- Business workspace shell
- Functional Catalog for products and services
- Category and item create/edit/archive flows
- Database integrity constraints for cross-business relationships
- Automatic `updated_at` maintenance on mutable business data
- Management policies separated by operation for business, member, and module administration
- Security advisor currently reports only Supabase Auth leaked-password protection as a warning
