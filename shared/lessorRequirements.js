// Canonical checklist of documents a lessor (unit owner) submits to O-Lease.
export const LESSOR_REQUIREMENT_TYPES = [
  { key: "GOV_ID",          label: "Valid Government ID" },
  { key: "OWNERSHIP",       label: "Proof of Ownership (Title / CCT)" },
  { key: "TAX_DEC",         label: "Tax Declaration" },
  { key: "RPT_RECEIPT",     label: "Latest Real Property Tax Receipt" },
  { key: "AUTH_LETTER",     label: "Authorization Letter / SPA" },
  { key: "ASSOC_CLEARANCE", label: "Association / Dues Clearance" },
  { key: "BANK_DETAILS",    label: "Bank Account Details" },
];

export const REQUIREMENT_STATUSES = [
  "Required", "Submitted", "Under Review", "Approved", "Rejected", "Expired", "For Resubmission",
];

export const REQUIREMENT_KEYS = LESSOR_REQUIREMENT_TYPES.map((r) => r.key);
export const labelFor = (key) => LESSOR_REQUIREMENT_TYPES.find((r) => r.key === key)?.label || key;
