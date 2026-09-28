<div align="center">

# Atelier OG — Business OS

### Multi-tenant business platform for digital catalogues, menus, orders and business workflows

**Atelier OG / Business OS** is being built as a reusable platform for restaurants, retail, jewellery, clothing, salons, service businesses and other catalog-based businesses.

</div>

---

## Product snapshot

| | |
|---|---|
| **Product** | Atelier OG / Business OS |
| **Type** | Multi-tenant business platform |
| **Builder** | Rahul Kumar · Atelier OG |
| **Core model** | Business → Members → Modules → Catalog → Digital Experiences → Customers → Orders |
| **Status** | Fresh rebuild; active implementation |

> This repository represents an actively developed product foundation. Features are documented according to the current implementation rather than presented as a finished production platform.

---

## The product idea

Many small businesses need a digital presence, catalogue, ordering flow and operational tools, but each business does not need a completely separate software system.

Business OS is being designed around a reusable **multi-tenant foundation** where a business can receive the modules and digital experiences it needs while remaining isolated from other businesses.

The key architectural decision is simple:

> **The tenant is a business — not a restaurant.**

That allows the same platform foundation to support different business types instead of hard-coding the product around one industry.

---

## Core platform model

```text
                    BUSINESS OS
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
     Super Admin                  Business Workspace
          │                             │
          ▼                             ▼
   Module Entitlements          Members / Permissions
                                        │
                    ┌───────────────────┼──────────────────┐
                    ▼                   ▼                  ▼
                 Catalog       Digital Experiences     Customers
                    │                   │                  │
                    └───────────────────┼──────────────────┘
                                        ▼
                                      Orders
                                        │
                                        ▼
                                   Automation
                                        │
                                        ▼
                                   Audit Logs
```

---

## Platform foundation

The current foundation includes:

- **Super Admin** — platform-level business and module administration
- **Businesses** — tenant entities isolated from one another
- **Business Members** — business-level users and invitations
- **Module Entitlements** — control which capabilities a business can access
- **Catalog** — reusable product/service catalogue model
- **Digital Experiences** — customer-facing experiences built from the platform
- **Customers** — customer records within a business
- **Orders** — order workflow foundation
- **Inquiries** — business/customer inquiry workflows
- **Automation** — future operational automation layer
- **Audit Logs** — operational traceability

---

## Product architecture decisions

### 1. Business-first tenancy

The platform does not assume every customer is a restaurant. A business is the tenant, allowing the same architecture to support multiple industries.

### 2. Catalog is the core system

The catalogue is a general product/service system. A restaurant Menu is treated as an optional digital experience rather than the underlying data model.

### 3. Server-side entitlement enforcement

Module access is not trusted to the UI alone. Access is enforced through server/database-side controls.

### 4. Tenant isolation

Every business is isolated from every other business. Cross-business relationships are protected through database integrity constraints and access policies.

### 5. Platform-level control

Super Admin controls business creation, member administration and module access.

### 6. Clean rebuild

The current source of truth is a fresh rebuild. Previous Restaurant/Digital Menu implementation is not treated as the new architecture.

---

## Current implementation

The current milestone includes:

- Super Admin business management
- Member invitation
- Per-business module entitlements
- Business workspace shell
- Functional Catalog for products and services
- Category and item create/edit/archive flows
- Database integrity constraints for cross-business relationships
- Automatic `updated_at` maintenance on mutable business data
- Operation-specific management policies for business, member and module administration

The repository currently reports the Supabase Auth leaked-password protection warning through the security advisor; this is documented as a remaining configuration item rather than hidden.

---

## Product thinking

The project is intentionally being developed as a **reusable platform**, not a collection of disconnected demos.

The product-development loop is:

**Business problem → reusable model → tenant isolation → module boundary → user workflow → implementation → security validation → iteration**

This approach makes each new digital product or business workflow easier to build on top of the same foundation.

---

## Why this project matters to my product work

Business OS gives me hands-on experience with several product-management problems at the same time:

- Defining a reusable product model
- Designing multi-tenant SaaS boundaries
- Translating business requirements into modules
- Separating core systems from industry-specific experiences
- Designing role and permission models
- Thinking about MVP scope and future extensibility
- Working across product requirements and technical architecture
- Building and validating the actual implementation

It is part of my broader work under **Atelier OG**, where I am building practical SaaS and digital business products.

---

## Roadmap direction

The architecture is designed to support additional experiences on the same foundation, including:

- Restaurant menu and ordering
- Digital catalogues
- QR-driven customer experiences
- Business workflows
- Automation
- Additional industry-specific modules

These are development directions, not claims that every listed module is already production-ready.

---

## Builder

**Rahul Kumar**  
Product Builder • SaaS • AI & Automation  
Founder, Atelier OG  
BCA, Arka Jain University  
Retail Gemologist, Tanishq

---

<div align="center">

**One business platform. Multiple digital experiences.**

</div>
