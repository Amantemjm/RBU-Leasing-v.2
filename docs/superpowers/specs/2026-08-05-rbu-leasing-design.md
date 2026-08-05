# RBU Leasing — Design Spec

**Date:** 2026-08-05
**Status:** Approved (pending spec review)

## Overview

A full-stack web application for the Residential Business Unit (RBU) to manage its
residential leasing operations. The app tracks unit owners, units, tenants, leases,
and rent payments, and surfaces this data through a live **Dashboard**, a period-based
**Executive Summary**, and downloadable **Excel reports**.

## Goals

- Single source of truth for owners, units, tenants, leases, and payments.
- At-a-glance operational visibility (dashboard).
- Period-over-period analysis for management (executive summary).
- One-click Excel exports for standard leasing reports.
- Role-based access so executives see read-only views while officers manage data.

## Non-Goals (v1)

- Online rent payment / payment gateway integration (payments are recorded manually).
- Tenant-facing portal.
- Document storage / e-signatures for contracts.
- Multi-currency (assume a single currency, PHP).

These may be added later; the design should not preclude them.

## Tech Stack

- **Frontend:** Vue 3 (latest stable) + Vite, Vue Router, Pinia (state), Axios (HTTP).
- **Backend:** Node.js (latest LTS) + Express.
- **Database:** PostgreSQL (latest stable) via Prisma ORM.
- **Auth:** JWT (access token), role-based authorization middleware.
- **Reports:** ExcelJS for `.xlsx` generation.
- **Testing:** Vitest (unit) for service-layer logic; Supertest for API/auth integration tests.

## Architecture

Monorepo with two applications:

```
/client   Vue 3 SPA
/server   Express API
```

The server follows a layered structure so business logic is isolated and testable:

```
routes/        HTTP endpoints, wire to controllers
controllers/   Request/response handling, validation
services/      Business logic + all leasing calculations (single source of truth)
prisma/        Schema, migrations, generated client
middleware/    Auth (JWT verify), role guards, error handling
```

**Key principle:** all derived leasing math — occupancy rate, expected vs. collected,
overdue detection, lease-expiry windows, period comparisons, report rows — lives in
`services/` and nowhere else. The dashboard, executive summary, and reports all call
these same service functions, so numbers are always consistent.

## Data Model (Prisma)

### User
- `id`, `name`, `email` (unique), `passwordHash`, `role`, `createdAt`, `updatedAt`
- `role`: enum `ADMIN | LEASING_OFFICER | VIEWER`

### UnitOwner
- `id`, `name`, `email`, `phone`, `address`, timestamps
- Relations: has many `Unit`

### Unit
- `id`, `ownerId` (FK → UnitOwner), `unitNumber`, `building` (tower), `floor`,
  `type` (STUDIO | ONE_BR | TWO_BR | THREE_BR | ...), `sizeSqm`, `baseRent`,
  `status` (VACANT | OCCUPIED), timestamps
- Relations: belongs to `UnitOwner`; has many `Lease`

### Tenant
- `id`, `name`, `email`, `phone`, `address`, timestamps
- Relations: has many `Lease`

### Lease
- `id`, `unitId` (FK → Unit), `tenantId` (FK → Tenant), `startDate`, `endDate`,
  `monthlyRent`, `deposit`, `status` (ACTIVE | EXPIRED | TERMINATED), timestamps
- Relations: belongs to `Unit` and `Tenant`; has many `Payment`

### Payment
- `id`, `leaseId` (FK → Lease), `periodMonth` (the month the payment covers),
  `amount`, `dueDate`, `paidDate` (nullable), `status` (PAID | PENDING | OVERDUE),
  `method`, timestamps
- Relations: belongs to `Lease`
- v1 records full per-period payments (partial payments deferred).

**Derived, not stored:** a unit's live occupancy, a payment's overdue state
(`dueDate < today AND paidDate IS NULL`), occupancy rate, and all period rollups are
computed in services from the base data.

## Roles & Authorization

| Capability                                   | Admin | Leasing Officer | Viewer |
|----------------------------------------------|:-----:|:---------------:|:------:|
| Manage users                                 |  Yes  |       No        |   No   |
| CRUD owners/units/tenants/leases/payments    |  Yes  |       Yes       |   No   |
| View dashboard / summary / reports           |  Yes  |       Yes       |   Yes  |

JWT carries `userId` and `role`. Auth middleware verifies the token; a `requireRole`
guard protects write endpoints. The frontend hides/disables actions the role can't perform.

## Features

### Dashboard (live)
Six metric views:
1. **Occupancy** — units leased vs. vacant (count + rate).
2. **Monthly rental income** — sum of `monthlyRent` across active leases.
3. **Leases expiring soon** — grouped into next 30 / 60 / 90 days.
4. **Overdue / outstanding** — payments past due and total outstanding balance.
5. **New leases this month** — count of leases started in the current month.
6. **Counts** — total tenants, owners, units.

### Executive Summary (period-based)
- User selects a period: month, quarter, or year.
- Shows for the selected period vs. the immediately prior period: total income,
  collections (expected vs. collected), occupancy rate, new leases, terminated leases,
  with delta indicators.

### Reports (Excel, via ExcelJS)
Each generates a downloadable `.xlsx`:
1. **Rent Roll** — all active leases: tenant, unit, owner, monthly rent, term, balance.
2. **Collections** — payments received within a selected period.
3. **Lease Expiry** — leases expiring within a selected window.
4. **Owner Statement** — per owner: their units, gross income, occupancy.

## Testing Strategy

- **Unit tests (Vitest)** on service-layer functions: overdue detection, occupancy %,
  expected-vs-collected, expiry windows, period comparisons, and report row builders.
  These are the highest-value tests since every feature depends on them.
- **Integration tests (Supertest)** on auth (login, JWT verify) and role guards
  (a Viewer cannot write; an Officer cannot manage users).

## Build Order (phased)

1. Project scaffold + Prisma schema + migrations + seed data.
2. Auth (register/login, JWT, role middleware).
3. CRUD APIs + Vue screens for owners, units, tenants, leases, payments.
4. Dashboard (service functions + API + Vue view).
5. Executive Summary (period service + API + Vue view).
6. Excel reports (ExcelJS generators + download endpoints + UI).

Each phase produces something usable and independently testable.

## Open Questions / Future

- Currency: PHP assumed for formatting.
- Whether payments should later support partial payments per period.
- Later additions the user mentioned will be folded in as new specs.
