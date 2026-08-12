// Field groups for the Unit Owner Information Sheet, shared by the owner form
// and the staff read-only review.
export const INFO_SHEET_GROUPS = [
  {
    title: "Personal",
    fields: [
      { key: "fullName", label: "Full name", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "mobile", label: "Mobile", required: true },
      { key: "telephone", label: "Telephone" },
      { key: "mailingAddress", label: "Mailing address" },
      { key: "nationality", label: "Nationality" },
      { key: "civilStatus", label: "Civil status" },
      { key: "tin", label: "TIN" },
      { key: "governmentIdType", label: "Government ID type" },
      { key: "governmentIdNumber", label: "Government ID number" },
      { key: "birthdate", label: "Birthdate", type: "date" },
      { key: "spouseName", label: "Spouse name" },
    ],
  },
  {
    title: "Authorized Representative",
    fields: [
      { key: "repName", label: "Name" },
      { key: "repContact", label: "Contact" },
      { key: "repEmail", label: "Email", type: "email" },
    ],
  },
  {
    title: "Bank Details",
    fields: [
      { key: "bankName", label: "Bank name", required: true },
      { key: "accountName", label: "Account name", required: true },
      { key: "accountNumber", label: "Account number", required: true },
      { key: "bankBranch", label: "Bank branch" },
    ],
  },
];

export const INFO_SHEET_KEYS = INFO_SHEET_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
export const INFO_SHEET_REQUIRED = INFO_SHEET_GROUPS.flatMap((g) =>
  g.fields.filter((f) => f.required).map((f) => f.key),
);
