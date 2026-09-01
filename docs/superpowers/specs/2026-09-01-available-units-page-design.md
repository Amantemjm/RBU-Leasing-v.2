# Available Units for Lease (Public Page) — Design Spec

**Date:** 2026-09-01
**Status:** Approved (design), pending implementation plan
**Sub-project:** J of the "Unit Photos & Available Units for Lease" module — the public browsing UI. Builds entirely on sub-project I's public read API; no server or schema changes.
**Area:** Client only — a reusable unit card, a public grid page with filters, a public detail page, and a landing-page entry link.

## Problem

Sub-project I lets staff publish units with photos and curated details, and exposes them through an unauthenticated read API (`GET /api/public/units`, `/:unitId`, `/photo/:photoId`). But there is no page where prospective lessees can browse those units.

## Goal

A public **Available Units for Lease** page: a responsive grid of unit cards (cover photo with ◀/▶ photo navigation + the configured details), simple filters (location/estate + unit type), and a per-unit detail page with the full photo carousel and all configured details. Reachable from the public landing page — no login required.

## Decisions (carried from the module brainstorm)

| Topic | Decision |
|---|---|
| Data source | The existing public API from sub-project I (published + VACANT + APPROVED units only). No new endpoints. |
| Card | A reusable `UnitCard.vue`: cover photo, ◀/▶ arrows cycling the unit's photos, configured details, "View details". |
| Filters | Simple: **location/estate** + **unit type**, populated from the loaded set and applied via the API's `estateId`/`type` query. |
| Detail page | Full-width photo carousel + all configured (visible) details + captions. |

## Non-goals

- Server/schema changes (all in I). Rich filters (price/beds/amenities), map view, saved favorites, inquire-from-card wiring, pagination/infinite scroll (the set is small).

## Architecture

### 1. `UnitCard.vue` (new component)

Props: `card` (a public card DTO: `{ unitId, headline, type, location, estate, details, coverPhotoId, photoIds }`).
- A photo area showing the current photo via `publicUnits.photoUrl(photoId)` in a plain `<img>` (public, no auth). Starts on `coverPhotoId` (or the first `photoId`). **◀/▶ arrow buttons** cycle `photoIds` (wrap-around); a small dot/counter shows position. Arrows are hidden when there is ≤1 photo. An empty state (no photos) shows a placeholder block.
- Below the photo: `headline` (or the unit's `propertyName`/`unitNumber` from details), the `location`, and the configured `details` rendered as labelled lines using the shared `UNIT_LISTING_FIELDS` labels (only keys present in `details`, i.e. the staff-chosen visible fields; formats `rentalRate` as currency and `amenities` as a comma list).
- A **View details** action → routes to `/units-for-lease/:unitId`.
- Emits nothing required beyond navigation; self-contained.

### 2. `AvailableUnitsView.vue` (new public view) at `/units-for-lease`

- On mount, `publicUnits.list()` (unfiltered) → the full set; derive **filter options**: distinct estates (`card.estate`) and distinct `type`s from the set.
- Two `<select>` filters (Location/Estate, Unit Type) + a "Clear" control. Changing a filter calls `publicUnits.list({ estateId, type })` and re-renders the grid (server-side filtering; the API supports both params).
- Renders a **responsive grid** of `UnitCard` (CSS grid, `minmax` columns; 1 column on mobile). A header ("Available Units for Lease") and a result count. An empty state ("No units match your filters." / "No units are currently available.").
- Public route: `{ path: "/units-for-lease", component: AvailableUnitsView }` (no `meta.roles` → public, like `/`, `/inquiry`). A back/Home affordance to the landing page.

### 3. `UnitDetailPublicView.vue` (new public view) at `/units-for-lease/:id`

- On mount, `publicUnits.get(route.params.id)`; 404/not-found → a friendly "This unit is no longer available" with a link back to the list.
- A larger **photo carousel** (◀/▶ + thumbnails or dots) over all `photoIds`, showing captions when present.
- All configured `details` rendered as a labelled spec list (using `UNIT_LISTING_FIELDS` labels; currency/amenities formatting shared with the card), plus `headline` and `location`.
- Public route: `{ path: "/units-for-lease/:id", component: UnitDetailPublicView }`.

### 4. Shared formatting + entry point

- A tiny `client/src/lib/listingFormat.js` helper (or a function co-located and imported) used by both card and detail: `labelFor(key)` (from `UNIT_LISTING_FIELDS`), `formatDetail(key, value)` (currency for `rentalRate`, join for `amenities`/arrays, plain otherwise), and an ordered iteration of a `details` object following the catalog order.
- **Entry link**: on the public landing page (`InquiryStartView.vue`), add a visible "Browse available units" link/button → `/units-for-lease`.

## Data flow

```
Public visitor → landing → "Browse available units" → /units-for-lease
  GET /api/public/units → grid of UnitCard (cover + ◀/▶ photos via /photo/:id)
  filter (estate/type) → GET /api/public/units?estateId=&type=
  click a card → /units-for-lease/:id → GET /api/public/units/:id → carousel + full details
```

## Error handling

- List load failure → an error line + retry; empty result → empty state (not an error).
- Detail load 404 (unit unpublished/leased since listing) → "no longer available" message + link back.
- Broken/missing image → the `<img>` onerror falls back to the placeholder block.

## Testing (Vitest / @vue/test-utils)

- `UnitCard`: renders the configured details (labelled, currency-formatted `rentalRate`), shows the cover photo first, ◀/▶ cycles `photoIds` (src changes; wraps), arrows hidden with ≤1 photo, "View details" routes to `/units-for-lease/:id`.
- `AvailableUnitsView`: renders a grid from a mocked `publicUnits.list`; derives estate/type filter options; changing a filter calls `publicUnits.list` with the right params; empty state when the list is empty.
- `UnitDetailPublicView`: renders all details + carousel from a mocked `publicUnits.get`; carousel ◀/▶ changes the shown photo; not-found path renders the "no longer available" message.
- `listingFormat`: `labelFor`/`formatDetail` (currency + amenities join) behave.
- Landing: `InquiryStartView` renders the "Browse available units" link to `/units-for-lease`.

## Rollout

Client-only; rebuild the client. No migration, no server change.

## Affected files

- `client/src/components/UnitCard.vue`, `client/src/views/AvailableUnitsView.vue`, `client/src/views/UnitDetailPublicView.vue`, `client/src/lib/listingFormat.js` (new)
- `client/src/router/index.js` (two public routes), `client/src/views/InquiryStartView.vue` (entry link)
- `resource.js` already has `publicUnits` (from sub-project I) — no change.
- Client tests
