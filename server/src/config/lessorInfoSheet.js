// Single config that drives the Lessor (Unit Owner) form, validation, and PDF.
// Mirrors the official O-Lease "Unit Owner Information Sheet • Registration" form.
//
// Field types:
//   text | textarea | date | number | email | tel  — plain inputs
//   radio       — single choice from `options`, rendered as tick-boxes
//   checkboxes  — multiple choice from `options`, value is an array
// A choice field may set `allowOther: true` to add a write-in box; the typed
// value is stored under `<key>Other` (with an optional `otherLabel` prefix).
export default {
  title: "Unit Owner Information Sheet",
  sections: [
    {
      title: "Registration",
      fields: [{ key: "registrationNumber", label: "O-Lease Registration Number", type: "text" }],
    },
    {
      title: "A. Personal Data",
      fields: [
        { key: "lastName", label: "Last Name", type: "text", required: true },
        { key: "firstName", label: "First Name", type: "text", required: true },
        { key: "middleInitial", label: "Middle Initial", type: "text" },
        { key: "suffix", label: "Suffix", type: "text" },
        { key: "birthday", label: "Birthday", type: "date" },
        { key: "sex", label: "Sex", type: "radio", options: ["Male", "Female"] },
        { key: "nationality", label: "Nationality", type: "text" },
        { key: "civilStatus", label: "Civil Status", type: "radio", options: ["Single", "Married"] },
        { key: "homeAddress", label: "Home Address", type: "textarea" },
        { key: "telephone", label: "Telephone Number", type: "tel" },
        { key: "mobile", label: "Mobile Number", type: "tel", required: true },
        { key: "email", label: "Email Address", type: "email", required: true },
        {
          key: "preferredChannel",
          label: "Preferred Channel",
          type: "checkboxes",
          options: ["SMS", "Call", "Email", "Viber", "Messenger", "WhatsApp"],
          allowOther: true,
        },
      ],
    },
    {
      title: "Details of Spouse",
      fields: [
        { key: "spouseLastName", label: "Last Name", type: "text" },
        { key: "spouseFirstName", label: "First Name", type: "text" },
        { key: "spouseMiddleInitial", label: "Middle Initial", type: "text" },
        { key: "spouseSuffix", label: "Suffix", type: "text" },
      ],
    },
    {
      title: "B. Lease Information",
      fields: [
        {
          key: "estate",
          label: "Estate",
          type: "radio",
          options: ["Capitol Commons", "Circulo Verde", "Greenhills Center", "Ortigas East"],
          required: true,
        },
        { key: "buildingName", label: "Name of Building", type: "text" },
        { key: "unitNumber", label: "Unit Number", type: "text", required: true },
        { key: "floorArea", label: "Floor Area (in sqm)", type: "number" },
        {
          key: "unitType",
          label: "Unit Type",
          type: "radio",
          options: ["Studio", "1-bedroom"],
          allowOther: true,
        },
        {
          key: "unitDressUp",
          label: "Unit Dress-up",
          type: "radio",
          options: ["Bare Unit", "Semi-furnished", "Fully Furnished"],
        },
        {
          key: "unitView",
          label: "Unit View",
          type: "radio",
          options: ["Facing Amenities", "Not Facing Amenities"],
        },
        {
          key: "petRestriction",
          label: "Pet Restriction",
          type: "radio",
          options: ["With Pet", "No Pet"],
          allowOther: true,
          otherLabel: "Others",
        },
        { key: "unitStatus", label: "Unit Status", type: "radio", options: ["EMI", "RTO", "OL EMP"] },
        {
          key: "leaseTermPeriod",
          label: "Preferred Lease Term Period",
          type: "radio",
          options: ["Medium Term (6 to 11 months)", "Long Term (1 year and above)"],
        },
        { key: "preferredLeaseRate", label: "Preferred Lease Rate", type: "text" },
        { key: "negotiable", label: "Negotiable", type: "radio", options: ["Yes", "No"] },
        { key: "specialInstructions", label: "Special Instructions", type: "textarea" },
        { key: "parkingSlotNumber", label: "Parking Slot Number", type: "text" },
        { key: "parkingFloorArea", label: "Parking Floor Area", type: "text" },
        { key: "parkingForLease", label: "Parking For Lease?", type: "radio", options: ["Yes", "No"] },
        { key: "parkingLeaseRate", label: "Parking Lease Rate", type: "text" },
        { key: "parkingSpecialInstructions", label: "Parking Special Instructions", type: "textarea" },
      ],
    },
    {
      title: "C. Representative Personal Data",
      fields: [
        { key: "repLastName", label: "Last Name", type: "text" },
        { key: "repFirstName", label: "First Name", type: "text" },
        { key: "repMiddleInitial", label: "Middle Initial", type: "text" },
        { key: "repSuffix", label: "Suffix", type: "text" },
        { key: "repRelationship", label: "Relationship to Unit Owner", type: "text" },
        { key: "repHomeAddress", label: "Home Address", type: "textarea" },
        { key: "repTelephone", label: "Telephone Number", type: "tel" },
        { key: "repMobile", label: "Mobile Number", type: "tel" },
        { key: "repEmail", label: "Email Address", type: "email" },
        {
          key: "repPreferredChannel",
          label: "Preferred Channel",
          type: "checkboxes",
          options: ["SMS", "Call", "Email", "Viber", "Messenger", "WhatsApp"],
          allowOther: true,
        },
      ],
    },
    {
      title: "D. Client Acknowledgement",
      fields: [
        {
          key: "howDidYouKnow",
          label: "How did you know about O-Lease?",
          type: "radio",
          options: ["Website", "Social Media", "Email", "Property Management Office"],
          allowOther: true,
        },
      ],
    },
  ],
};
