# Digital Vision Architecture

**Status:** Approved foundation baseline for incremental migration  
**Product:** Digital Vision by Atelier OG  
**Architecture style:** Multi-tenant modular monolith  
**Current implementation branch:** `release/digital-vision-unified`  
**Foundation branch:** `architecture/platform-foundation`

## Purpose

This directory is the canonical home for Digital Vision's system architecture, technical decisions and migration controls. It separates the intended architecture from implementation status and release notes.

## Architecture at a glance

Digital Vision is one multi-tenant business platform. A **Business** is the tenant; industry-specific experiences such as restaurant menus are modules and experiences built on shared business capabilities.

- **Web application:** Vite-powered browser SPA, served by Vercel.
- **Identity:** Supabase Auth.
- **System of record:** Supabase PostgreSQL with RLS, constraints and migrations.
- **Privileged workflows:** Supabase Edge Functions and narrowly scoped database RPCs.
- **Live updates:** Supabase Realtime, with tenant-scoped channel ownership.
- **Files:** Supabase Storage with tenant-scoped policies.
- **Cloudflare:** Existing Worker is treated as a legacy integration until repository references, DNS, routes and runtime dependencies prove it is part of the active Digital Vision request path.

## Documents

- [Target architecture](./target-architecture.md) — system boundaries, runtime flow, target source layout and engineering rules.
- [Current state and migration plan](./current-state-and-migration-plan.md) — verified baseline, known risks, migration sequence and acceptance gates.
- [ADR-001: Modular monolith](./decisions/ADR-001-modular-monolith.md) — why the product remains one deployable application with explicit module boundaries.

Related operating policy:
- [Git and release workflow](../engineering/git-and-release-policy.md)

## Non-negotiable invariants

1. Business is the tenant. No feature may assume that every business is a restaurant.
2. Every tenant-owned query, cache entry, realtime channel, storage path and mutation is scoped to a business.
3. Authorization is enforced by database RLS/constraints and server-side commands; UI guards are usability controls only.
4. The authenticated application shell is persistent. Feature errors stay inside their feature region.
5. Navigation is immediate and URL/state authoritative. No automatic route rollback on data failure.
6. Each section owns its data loading, empty, error and retry states.
7. A deployment is identified by an immutable Git commit SHA and a verified environment.
8. No production database reset, destructive migration or production promotion during the migration without a separate release approval.

## How to use this architecture

Before changing code, identify the owning layer and module. Put the change in that layer, add the relevant tests, and update the implementation status. Do not create a second router, auth bootstrap, tenant context, Supabase client or deployment pipeline to work around an existing boundary.
