// Single source of truth for inquiry classification, shared by the server
// (validation) and the client (form + table) so the option sets cannot drift.

export const INQUIRER_TYPES = ["LESSOR", "LESSEE"];

export const INQUIRER_LABEL = {
  LESSOR: "Lessor (Unit Owner)",
  LESSEE: "Lessee (Prospective Tenant)",
};

// Allowed Inquiry Types per inquirer.
export const INQUIRY_TYPES = {
  LESSEE: [
    "Unit Availability",
    "Rental Rate",
    "Unit Details",
    "Property Viewing",
    "Lease Terms",
    "Requirements",
    "Fees & Payments",
    "General Inquiry",
  ],
  // Ordered by where the owner sits in the lease lifecycle: bringing a unit in,
  // pricing and matching it, agreeing terms, then what happens once a lease is
  // running. Renewal and pre-termination are recurring leasing work, not
  // afterthoughts — before they existed here they fell into "General Inquiry"
  // and could not be reported on.
  LESSOR: [
    "List Unit for Lease",
    "Update Listing",
    "Rental Rate",
    "Find a Tenant",
    "Tenant Screening",
    "Leasing Terms",
    "Fees & Commission",
    "Lease Contract",
    "Lease Renewal",
    "Lease Pre-termination",
    "Property Management",
    "General Inquiry",
  ],
};
