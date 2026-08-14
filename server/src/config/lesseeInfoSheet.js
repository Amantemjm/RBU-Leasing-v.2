// Single config that drives the Lessee (Tenant) form, validation, and PDF.
export default {
  title: "Lessee Information Sheet",
  sections: [
    {
      title: "Applicant Details",
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
        { key: "presentAddress", label: "Present address", type: "textarea", required: true },
        { key: "spouseName", label: "Spouse name", type: "text" },
      ],
    },
    {
      title: "Employment & Income",
      fields: [
        { key: "employerName", label: "Employer name", type: "text" },
        { key: "occupation", label: "Occupation", type: "text" },
        { key: "employmentAddress", label: "Employment address", type: "text" },
        { key: "monthlyIncome", label: "Monthly income", type: "number" },
        { key: "sourceOfIncome", label: "Source of income", type: "text" },
      ],
    },
    {
      title: "Unit & Occupancy",
      fields: [
        { key: "estate", label: "Estate", type: "select", source: "estates", required: true },
        { key: "tower", label: "Tower", type: "select", source: "towers", required: true },
        { key: "unitNumber", label: "Unit number", type: "text", required: true },
        { key: "purpose", label: "Purpose", type: "select", options: ["Residential", "Office"] },
        { key: "numberOfOccupants", label: "Number of occupants", type: "number" },
        { key: "occupantNames", label: "Occupant names", type: "textarea" },
        { key: "desiredMoveIn", label: "Desired move-in", type: "date" },
        { key: "leaseTerm", label: "Lease term", type: "text" },
      ],
    },
    {
      title: "Emergency Contact",
      fields: [
        { key: "emergencyName", label: "Name", type: "text", required: true },
        { key: "emergencyRelationship", label: "Relationship", type: "text" },
        { key: "emergencyContact", label: "Contact", type: "tel", required: true },
      ],
    },
    {
      title: "Character Reference",
      fields: [
        { key: "referenceName", label: "Name", type: "text" },
        { key: "referenceRelationship", label: "Relationship", type: "text" },
        { key: "referenceContact", label: "Contact", type: "tel" },
      ],
    },
  ],
};
