# Light & Friendly UI Redesign — Design

**Goal:** Restyle the internal (staff) app to the light, friendly, rounded look of the
reference property dashboard, keeping RBU's sage-green accent and Fraunces + Inter type.

## Approved decisions

- **Scope:** Whole internal app (staff shell + all staff screens). Public/portal
  pages are out of scope for this pass.
- **Direction:** Light & friendly like the reference — off-white ground, white
  cards with ~16px radius, soft shadows, light chrome (white sidebar + top bar),
  greeting header, pill search, trend chips, pastel donut, avatar/thumbnail list rows.
- **Accent:** Keep the existing sage green (`--accent: #53776A`). It already matches
  the reference; no hue change.
- **Dark mode:** Light becomes the **default**. The existing dark theme stays
  available through the theme toggle. Both must keep passing contrast.
- **Greeting:** Time-based + signed-in user's first name ("Good morning, Mark").
- **Folder:** Work in `RBU Leasing version 2` (the session's current folder).

## Architecture — why this is tractable app-wide

The app is already token-driven via `client/src/styles/app.css`
(`--surface`, `--paper`, `--accent`, `--chrome-*`, etc.) and shared component
classes (`.panel`, `.primary`, tables). The redesign is therefore mostly a
**palette + chrome retune** plus targeted work on the shell and dashboard.

The single biggest change: the sidebar and top bar are driven by `--chrome-*`
tokens currently set to dark green (`#183D3D`). Repointing those tokens to a
light scheme re-skins the whole shell in one place.

## Work breakdown

1. **Tokens (`app.css`)** — light `--chrome-*` (white surface, dark text, sage
   active state); soften `--line`; bump card radius; add reusable utility classes:
   `.trend-chip` (up/down), `.avatar`, `.list-row`. Dark-mode `--chrome-*` unchanged.
2. **Shell (`AppLayout.vue`)** — time-based greeting + first name; global search
   field in the top bar; light-sidebar nav states. Keep bell, theme toggle, user menu.
3. **Dashboard (`ExecutiveDashboardView.vue`)** — trend chips on KPI tiles;
   recolor occupancy/breakdown donut to the soft multi-tone palette; avatar/thumbnail
   list rows for recent activity + actions.
4. **Component sweep** — buttons, badges, tables, forms, modals inherit the new
   tokens; spot-fix any hardcoded dark chrome values.
5. **Verify** — dev server in the browser (light + dark), then `npm test` (client).

## Non-goals

- No data-model or API changes. No new "sales"/"maintenance" concepts — reference
  sections map onto existing leasing data (units, occupancy, leases, transactions,
  approvals).
- Public/portal pages unchanged this pass.
