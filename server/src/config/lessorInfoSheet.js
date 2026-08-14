// Single config that drives the Lessor (Unit Owner) form, validation, and PDF.
export default {
  title: "Unit Owner Information Sheet",
  sections: [
    {
      title: "Registrant Details",
      fields: [
        { key: "lastName", label: "Last name", type: "text", required: true },
        { key: "firstName", label: "First name", type: "text", required: true },
        { key: "middleName", label: "Middle name", type: "text" },
        { key: "nationality", label: "Nationality", type: "text" },
        { key: "civilStatus", label: "Civil status", type: "select", options: ["Single", "Married", "Widowed", "Separated"] },
        { key: "birthdate", label: "Birthdate", type: "date" },
        { key: "tin", label: "TIN", type: "text" },
        { key: "idType", label: "ID type", type: "text" },
        { key: "idNumber", label: "ID number", type: "text" },
        { key: "mobile", label: "Mobile", type: "tel", required: true },
        { key: "telephone", label: "Telephone", type: "tel" },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "spouseName", label: "Spouse name", type: "text" },
      ],
    },
    {
      title: "Corporate (if applicable)",
      fields: [
        { key: "companyName", label: "Company name", type: "text" },
        { key: "authorizedRep", label: "Authorized representative", type: "text" },
        { key: "repDesignation", label: "Representative designation", type: "text" },
        { key: "repContact", label: "Representative contact", type: "tel" },
      ],
    },
    {
      title: "Property Details",
      fields: [
        { key: "estate", label: "Estate", type: "select", source: "estates", required: true },
        { key: "tower", label: "Tower", type: "select", source: "towers", required: true },
        { key: "unitNumber", label: "Unit number", type: "text", required: true },
        { key: "floor", label: "Floor", type: "text" },
        { key: "parkingSlot", label: "Parking slot", type: "text" },
        { key: "unitType", label: "Unit type", type: "text" },
        { key: "floorAreaSqm", label: "Floor area (sqm)", type: "number" },
        { key: "titleNumber", label: "Title number", type: "text" },
        { key: "turnoverDate", label: "Turnover date", type: "date" },
      ],
    },
    {
      title: "Leasing Preferences",
      fields: [
        { key: "targetMonthlyRent", label: "Target monthly rent", type: "number" },
        { key: "leaseTermPreference", label: "Lease term preference", type: "text" },
        { key: "furnishing", label: "Furnishing", type: "select", options: ["Furnished", "Semi-furnished", "Bare"] },
        { key: "underPropertyManagement", label: "Under property management", type: "select", options: ["Yes", "No"] },
      ],
    },
    {
      title: "Remittance Bank Details",
      fields: [
        { key: "bankName", label: "Bank name", type: "text", required: true },
        { key: "accountName", label: "Account name", type: "text", required: true },
        { key: "accountNumber", label: "Account number", type: "text", required: true },
        { key: "bankBranch", label: "Bank branch", type: "text" },
        { key: "accountType", label: "Account type", type: "select", options: ["Savings", "Checking"] },
      ],
    },
  ],
};
