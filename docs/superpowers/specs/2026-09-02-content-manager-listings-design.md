# Content Manager — Listings (Featured Properties) + admin structure

**Date:** 2026-09-02
**Status:** Approved (design), pending implementation.
**Reference:** Costa Calatagan admin (`/admin/cms`) — mirror its *structure* (Content Manager as a hub of content sections; Villas = a table of items with a gallery/detail editor + Draft/Published status; Users; Audit Log). Keep RBU's forest-green brand + fonts.

## Goal

Bring unit photo/listing management **into the Content Manager** as a central **Listings (Featured Properties)** section — one place for O-Lease/Admin to manage every unit's photos + details + publish state — and align the Content Manager, System Users, and Audit Trail to one consistent admin structure. Published units flow to the public Featured Properties (already wired).

## Decisions

- Placement: a **Listings section inside the Content Manager** hub (keep the per-unit "Manage listing & photos" entry as a shortcut too). Content Manager also keeps the **Forms** section.
- Access: **O-Lease + Admin** for the Content Manager hub + Listings; the **Forms** section stays Admin-only.
- Look: **structure from Costa, visual language stays RBU green.**

## Architecture

### Server
- `unitListingService.listAll()` → every unit with a listing summary: `{ unitId, unitNumber, propertyName, location, approvalStatus, published, publishedAt, photoCount, coverPhotoId, updatedAt }` (metadata only, no bytes).
- Route `GET /api/unit-listings` (staff read: ADMIN/LEASING_OFFICER/VIEWER), placed before `/:unitId`. Additive.

### Client
- **Content Manager hub** `ContentManagerView` at `/app/content` (write roles): section cards — **Listings** (→ `/app/content/listings`) and **Forms** (→ `/app/forms`, Admin-only card). Mirrors Costa's content-section list.
- **Listings manager** `ListingsManagerView` at `/app/content/listings` (write roles): a card-wrapped table of units — *Property · Unit · Location · Status (Draft/Published + approval) · Photos · Updated* — with a **Manage** action (opens the existing `/app/units/:id/listing` editor) and inline **Publish / Unpublish**. Search by property/unit.
- `resource.js`: `unitListings.listAll()` → `GET /unit-listings`.
- **Nav:** point "Content Manager" at `/app/content`, role `write` (was admin). The Forms route/card stays Admin-gated.
- **Users + Audit:** wrap each in the shared `.panel`, use the standard page header, and consistent table columns/status pills — structurally consistent with the Listings table (light-touch; they're already tables). No behavior change.

## Non-goals

- Changing the per-unit editor (`UnitListingView`) itself. Adopting Costa's colors/fonts. New listing fields.

## Testing

- Server: `GET /unit-listings` returns all units with `published`/`photoCount`; staff-only.
- Client: `ListingsManagerView` renders rows from a mocked `unitListings.listAll`, Manage routes to the editor, Publish calls `unitListings.publish`; `ContentManagerView` renders the section cards; resource `listAll` hits the right URL; router serves the new routes with the right roles.

## Affected files

- `server/src/services/unitListingService.js`, `controllers/unitListingController.js`, `routes/unitListingRoutes.js`; server test.
- `client/src/views/ContentManagerView.vue`, `ListingsManagerView.vue` (new); `client/src/lib/resource.js`; `client/src/router/index.js`; `client/src/components/AppLayout.vue` (nav); light edits to `UsersView.vue`, `AuditView.vue`; client tests.
