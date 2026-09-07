// Canonical checklist of documents a lessee (tenant) submits to O-Lease.
// Mirrors the lessor checklist in shape so both sides of a lease are handled
// the same way — a fixed list of types, one upload each, reviewed by staff.
export const LESSEE_REQUIREMENT_TYPES = [
  { key: "GOV_ID",        label: "Valid Government ID" },
  { key: "PROOF_INCOME",  label: "Proof of Income / Latest Payslips" },
  { key: "COE",           label: "Certificate of Employment" },
  { key: "COMPANY_ID",    label: "Company ID or Business Permit" },
  { key: "CLEARANCE",     label: "NBI or Police Clearance" },
  { key: "PROOF_BILLING", label: "Proof of Billing / Current Address" },
  { key: "PAYMENT",       label: "Post-dated Cheques or Bank Details" },
];

// The same review vocabulary the lessor checklist uses, so staff learn one set.
export const LESSEE_REQUIREMENT_STATUSES = [
  "Required", "Submitted", "Under Review", "Approved", "Rejected", "Expired", "For Resubmission",
];

export const LESSEE_REQUIREMENT_KEYS = LESSEE_REQUIREMENT_TYPES.map((r) => r.key);
export const lesseeLabelFor = (key) =>
  LESSEE_REQUIREMENT_TYPES.find((r) => r.key === key)?.label || key;
