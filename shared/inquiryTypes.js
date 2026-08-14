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
  LESSOR: [
    "List Unit for Lease",
    "Rental Rate",
    "Find a Tenant",
    "Property Management",
    "Leasing Terms",
    "Fees & Commission",
    "Lease Contract",
    "General Inquiry",
  ],
};
