# ADR-001: Keep Digital Vision as a modular monolith

- **Status:** Accepted
- **Date:** 14 November 2026
- **Decision owners:** Atelier OG / Digital Vision engineering
- **Scope:** Frontend, domain boundaries and deployment model

## Context

Digital Vision is one product with shared identity, tenant, membership, entitlement, catalog, customer and order concepts. Its current runtime is a Vite SPA backed by Supabase Auth/PostgreSQL/Edge Functions and hosted on Vercel. The central frontend coordinator has become too large and couples route transitions, screen rendering and data access.

The product needs clearer module ownership and reliable incremental migration. It does not yet have evidence that independent services or separate frontend deployments would reduce complexity.

## Decision

Keep one deployable Digital Vision application and evolve it into a **feature-oriented modular monolith**.

- One application bootstrap, Supabase client, auth lifecycle and route registry.
- Explicit domain/repository contracts.
- Role-specific feature modules for Super Admin, Manager, Order Taker, Bill Counter and Customer/Public Menu.
- Supabase remains the system of record and server-side authorization boundary.
- Vercel remains the frontend deployment owner.
- Cloudflare Workers are used only for a separately justified integration, not as a duplicate frontend/API layer.

## Consequences

### Positive
- One consistent tenant and permission model.
- Fewer deployment and operational surfaces.
- Shared UI and domain rules without cross-portal duplication.
- Migration can happen feature by feature behind existing screens.
- Browser testing can validate complete user journeys in one environment.

### Trade-offs
- Module boundaries must be enforced by imports, ownership and tests.
- A central app coordinator remains temporarily during migration.
- A single deployment means release gates must cover all affected portals.
- Domain code must not import feature/UI code or directly manipulate the DOM.

## Rejected alternatives

- **Microservices now:** rejected because there is no measured scaling or ownership need to justify distributed transactions, service discovery and additional deployments.
- **Big-bang React/Next.js rewrite:** rejected because it combines a framework migration with the current reliability work and increases regression risk.
- **Keep the current monolith unchanged:** rejected because it preserves the existing coupling and makes Manager reliability difficult to verify.
