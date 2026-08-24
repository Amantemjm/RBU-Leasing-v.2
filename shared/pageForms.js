// Single source of truth for the CMS "page form" slots: which navigation
// destinations, per role, the Super Admin can attach a custom field set to.
// Shared by the server (slot validation) and the client (configurator + the
// app shell that renders the fields) so the two cannot drift.
//
// Every navigation item of each role is configurable. The only exclusion is the
// CMS "Forms" page itself (a page must not configure its own configurator).

export const ROLE_LABELS = {
  UNIT_OWNER: "Lessor",
  TENANT: "Lessee",
  LEASING_OFFICER: "O-Lease",
  ADMIN: "Super Admin",
};

// The staff workspace pages O-Lease and Super Admin share. Super Admin also gets
// the Administration pages below.
const STAFF_PAGES = [
  { key: "dashboard", label: "Dashboard", path: "/app" },
  { key: "inquiries", label: "Inquiries", path: "/app/inquiries" },
  { key: "transactions", label: "Leasing Tracker", path: "/app/transactions" },
  { key: "owners", label: "Owners", path: "/app/owners" },
  { key: "units", label: "Units", path: "/app/units" },
  { key: "tenants", label: "Tenants", path: "/app/tenants" },
  { key: "leases", label: "Leases", path: "/app/leases" },
  { key: "approvals", label: "Approvals", path: "/app/approvals" },
  { key: "lessor-sheets", label: "Lessor Sheets", path: "/app/lessor-sheets" },
  { key: "lessee-sheets", label: "Lessee Sheets", path: "/app/lessee-sheets" },
  { key: "requirements", label: "Requirements", path: "/app/requirements" },
];

// Role → every configurable page in that role's navigation bar. `key` is the
// slot id (stored on PageForm.pageKey), `label` is the nav item's name, `path`
// is the route whose page renders the fields.
export const ROLE_PAGE_FORMS = {
  UNIT_OWNER: [
    { key: "my-units", label: "My Units", path: "/app/my-units" },
    { key: "leasing-progress", label: "Leasing Progress", path: "/app/leasing-progress" },
    { key: "acceptance", label: "Acceptance Form", path: "/app/info-sheet" },
    { key: "my-leases", label: "My Leases", path: "/app/my-leases" },
    { key: "profile", label: "My Profile", path: "/app/my-profile" },
  ],
  TENANT: [
    { key: "my-lease", label: "My Lease", path: "/app/my-lease" },
    { key: "leasing-progress", label: "Leasing Progress", path: "/app/leasing-progress" },
    { key: "acceptance", label: "Acceptance Form", path: "/app/info-sheet-tenant" },
    { key: "requirements", label: "Requirements", path: "/app/requirements" },
    { key: "profile", label: "My Profile", path: "/app/my-profile" },
  ],
  LEASING_OFFICER: [...STAFF_PAGES],
  ADMIN: [
    ...STAFF_PAGES,
    { key: "users", label: "System Users", path: "/app/users" },
    { key: "audit", label: "Audit Trail", path: "/app/audit" },
  ],
};

// Resolve the configurable slot for a route path within a role — exact match
// first, then the most specific nav section the path falls under (so detail and
// form sub-routes like /app/units/new inherit the Units slot). "/app" only
// matches the dashboard exactly.
export function slotForPath(role, path) {
  const slots = ROLE_PAGE_FORMS[role] || [];
  const exact = slots.find((s) => s.path === path);
  if (exact) return exact;
  return slots
    .filter((s) => s.path !== "/app" && path.startsWith(`${s.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export const PAGE_FORM_ROLES = Object.keys(ROLE_PAGE_FORMS);

// The slot definition for a (role, pageKey), or undefined if it isn't a
// configurable slot.
export function pageFormSlot(role, pageKey) {
  return (ROLE_PAGE_FORMS[role] || []).find((p) => p.key === pageKey);
}

export function isValidSlot(role, pageKey) {
  return Boolean(pageFormSlot(role, pageKey));
}
